using System.Text.RegularExpressions;
using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using Dictionary.Api.Models;
using Dictionary.Api.Providers.Oxford.Models;
using static Dictionary.Api.Providers.HtmlExtractionHelpers;

namespace Dictionary.Api.Providers.Oxford;

/// <summary>
/// Parses an Oxford Learner's Dictionary entry page (oxfordlearnersdictionaries.com) into
/// Oxford's own model types. Pure HTML-in, model-out - no HTTP - so it can be tested against
/// saved fixtures.
/// </summary>
public static partial class OxfordHtmlParser
{
    public const string SourceName = "Oxford";

    public static DictionaryLookupResult<OxfordDictionaryEntry> Parse(string word, string html)
    {
        var parser = new HtmlParser();
        using var document = parser.ParseDocument(html);

        // Each homograph (e.g. "read" the verb vs. "read" the noun) is one .entry. Its senses
        // are NOT nested inside .top-g - .top-g only holds the header (headword/pronunciation/
        // symbols); <ol class="senses_multiple"> is a sibling of .top-g under the same .entry.
        var entryElements = document.QuerySelectorAll("#entryContent .entry");
        if (entryElements.Length == 0)
        {
            return new DictionaryLookupResult<OxfordDictionaryEntry>
            {
                Word = word,
                Source = SourceName,
                Error = $"No entries found for '{word}'",
            };
        }

        var entries = entryElements.Select(ExtractEntry).ToList();

        return new DictionaryLookupResult<OxfordDictionaryEntry> { Word = word, Source = SourceName, Entries = entries };
    }

    private static OxfordDictionaryEntry ExtractEntry(IElement entryElement)
    {
        // The first .top-g's .webtop is this entry's real header; a word's idioms can carry
        // their own mini top-g further down within the same .entry, which we don't want here.
        var webtop = entryElement.QuerySelector(".webtop");

        var (isKeyword, keywordLevel) = ExtractKeywordInfo(webtop);

        var senses = entryElement.QuerySelectorAll(".sense")
            .Select(ExtractSense)
            .Where(sense => sense is not null)
            .Select(sense => sense!)
            .ToList();

        return new OxfordDictionaryEntry
        {
            PartOfSpeech = ExtractText(webtop, ".pos"),
            Pronunciations = ExtractPronunciations(webtop),
            InflectionForms = ExtractInflectionForms(entryElement),
            IsKeyword = isKeyword,
            KeywordLevel = keywordLevel,
            AcademicWordLists = ExtractAcademicWordLists(webtop),
            Senses = senses,
        };
    }

    private static OxfordSense? ExtractSense(IElement senseElement)
    {
        var (isKeyword, cefrLevel) = ExtractKeywordInfo(senseElement);
        cefrLevel ??= NullIfEmpty(senseElement.GetAttribute("cefr"));

        var patterns = senseElement.Children
            .Where(child => child.ClassList.Contains("cf"))
            .Select(child => child.TextContent.Trim())
            .Where(text => text.Length > 0)
            .ToList();

        var examples = ExtractExamples(senseElement);

        var sense = new OxfordSense
        {
            Definition = senseElement.Children.FirstOrDefault(c => c.ClassList.Contains("def"))?.TextContent.Trim(),
            Grammar = ExtractGrammar(senseElement),
            Register = ExtractRegister(senseElement),
            Patterns = patterns,
            CefrLevel = cefrLevel,
            IsKeyword = isKeyword,
            Examples = examples,
        };

        var isMeaningful = sense.Definition is not null || sense.Examples.Count > 0 || sense.Patterns.Count > 0;
        return isMeaningful ? sense : null;
    }

    /// <summary>
    /// Each example li may carry its own .cf pattern (e.g. "be true (that)…" right next to
    /// "Is it true she's leaving?"), distinct from the sense-wide patterns already collected
    /// in <see cref="OxfordSense.Patterns"/>.
    /// </summary>
    private static List<OxfordExample> ExtractExamples(IElement senseElement)
    {
        var examplesList = senseElement.Children.FirstOrDefault(c => c.ClassList.Contains("examples"));
        if (examplesList is null)
        {
            return [];
        }

        var examples = new List<OxfordExample>();

        foreach (var item in examplesList.Children)
        {
            var textElement = item.Children.FirstOrDefault(c => c.ClassList.Contains("x"));
            if (textElement is null)
            {
                continue;
            }

            var pattern = item.Children.FirstOrDefault(c => c.ClassList.Contains("cf"))?.TextContent.Trim();
            var note = ExtractText(textElement, ".gloss");
            var segments = ExtractTextSegments(textElement, "cl", ".gloss");

            examples.Add(new OxfordExample
            {
                Segments = segments,
                Note = note,
                Pattern = NullIfEmpty(pattern),
            });
        }

        return examples;
    }

    private static List<Pronunciation> ExtractPronunciations(IElement? webtop)
    {
        if (webtop is null)
        {
            return [];
        }

        var british = ExtractAccentVariants(webtop.QuerySelector(".phons_br"));
        var american = ExtractAccentVariants(webtop.QuerySelector(".phons_n_am"));

        if (british.Count == 0 && american.Count == 0)
        {
            return [];
        }

        return [new Pronunciation { British = british, American = american }];
    }

    /// <summary>
    /// One accent block (.phons_br or .phons_n_am) can hold more than one recorded variant, e.g.
    /// "controversy" has two separate British pronunciations - each is a (.sound, .phon) pair,
    /// in order, so zipping the two element lists by index recovers the pairing.
    /// </summary>
    private static List<PhoneticVariant> ExtractAccentVariants(IElement? accentBlock)
    {
        if (accentBlock is null)
        {
            return [];
        }

        var sounds = accentBlock.QuerySelectorAll(".sound").ToList();
        var phons = accentBlock.QuerySelectorAll(".phon").ToList();

        var variants = new List<PhoneticVariant>();
        for (var i = 0; i < phons.Count; i++)
        {
            var ipa = phons[i].TextContent.Trim();
            if (ipa.Length == 0)
            {
                continue;
            }

            var audioUrl = i < sounds.Count ? NullIfEmpty(sounds[i].GetAttribute("data-src-mp3")) : null;
            variants.Add(new PhoneticVariant { Ipa = ipa, AudioUrl = audioUrl is { } url ? StripQueryString(url) : null });
        }

        return variants;
    }

    /// <summary>
    /// Reads the Oxford 3000/5000 keyword icon (e.g. class "ox5ksym_c1") within <paramref name="scope"/>'s
    /// own .symbols div. Used both at entry level (webtop) and per-sense (sensetop) - each sense
    /// only sees its own icon since a &lt;li class="sense"&gt; doesn't contain sibling senses.
    /// </summary>
    private static (bool IsKeyword, string? Level) ExtractKeywordInfo(IElement? scope)
    {
        var symbols = scope?.QuerySelector(".symbols");
        if (symbols is null)
        {
            return (false, null);
        }

        foreach (var span in symbols.QuerySelectorAll("span"))
        {
            foreach (var className in span.ClassList)
            {
                var match = KeywordSymbolRegex().Match(className);
                if (match.Success)
                {
                    return (true, match.Groups[1].Value);
                }
            }
        }

        return (false, null);
    }

    private static List<UsageLabel> ExtractAcademicWordLists(IElement? webtop)
    {
        var symbols = webtop?.QuerySelector(".symbols");
        if (symbols is null)
        {
            return [];
        }

        var labels = new List<UsageLabel>();

        foreach (var opal in symbols.QuerySelectorAll(".opal_symbol"))
        {
            var code = opal.TextContent.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                labels.Add(new UsageLabel { Code = code, Description = NullIfEmpty(opal.GetAttribute("href")) });
            }
        }

        return labels;
    }

    /// <summary>Nouns' plural and adjectives' comparative/superlative come from .inflections; verbs' principal parts come from the Verb Forms table - a word has at most one of the two.</summary>
    private static List<InflectionForm> ExtractInflectionForms(IElement topGroup)
    {
        var forms = new List<InflectionForm>();
        forms.AddRange(ExtractSimpleInflections(topGroup));
        forms.AddRange(ExtractVerbForms(topGroup));
        return forms;
    }

    /// <summary>
    /// .inflections holds a text label, an .inflected_form span (the word itself, render bold),
    /// and an optional .phonetics sibling with its own BR/AM pronunciation - repeated per form,
    /// e.g. "(comparative better /ˈbetə(r)/, superlative best /best/)".
    /// </summary>
    private static List<InflectionForm> ExtractSimpleInflections(IElement topGroup)
    {
        var container = topGroup.QuerySelector(".inflections");
        if (container is null)
        {
            return [];
        }

        var forms = new List<InflectionForm>();
        string? pendingLabel = null;

        foreach (var node in container.ChildNodes)
        {
            if (node is IText text)
            {
                var cleaned = text.Data.Trim(' ', '(', ')', ',');
                if (cleaned.Length > 0)
                {
                    pendingLabel = cleaned;
                }

                continue;
            }

            if (node is not IElement element)
            {
                continue;
            }

            if (element.ClassList.Contains("inflected_form"))
            {
                forms.Add(new InflectionForm { Label = pendingLabel, Form = element.TextContent.Trim() });
                pendingLabel = null;
            }
            else if (element.ClassList.Contains("phonetics") && forms.Count > 0)
            {
                var british = ExtractAccentVariants(element.QuerySelector(".phons_br"));
                var american = ExtractAccentVariants(element.QuerySelector(".phons_n_am"));
                if (british.Count > 0 || american.Count > 0)
                {
                    var last = forms[^1];
                    forms[^1] = new InflectionForm
                    {
                        Label = last.Label,
                        Form = last.Form,
                        Pronunciation = new Pronunciation { British = british, American = american },
                    };
                }
            }
        }

        return forms;
    }

    private static readonly Dictionary<string, string> VerbFormLabels = new()
    {
        ["thirdps"] = "3rd person singular present",
        ["past"] = "past tense",
        ["pastpart"] = "past participle",
        ["prespart"] = "-ing form",
    };

    /// <summary>
    /// Verbs list their principal parts in a "Verb Forms" table instead of .inflections, one row
    /// per part, each with its own full BR/AM pronunciation. "root" (bare infinitive - already the
    /// headword) and the auxiliary-only "neg"/"short"/"strong form" rows (seen only on "be") are
    /// deliberately not modeled here.
    /// </summary>
    private static List<InflectionForm> ExtractVerbForms(IElement topGroup)
    {
        var table = topGroup.QuerySelector(".verb_forms_table");
        if (table is null)
        {
            return [];
        }

        var forms = new List<InflectionForm>();

        foreach (var row in table.QuerySelectorAll("tr.verb_form"))
        {
            var formType = row.GetAttribute("form");
            if (formType is null || !VerbFormLabels.TryGetValue(formType, out var label))
            {
                continue;
            }

            var formCell = row.QuerySelector("td.verb_form");
            var form = formCell is null ? "" : ExtractTextExcluding(formCell, ".vf_prefix").Trim();
            if (form.Length == 0)
            {
                continue;
            }

            var phonsCell = row.QuerySelector("td.verb_phons");
            var british = ExtractAccentVariants(phonsCell?.QuerySelector(".phons_br"));
            var american = ExtractAccentVariants(phonsCell?.QuerySelector(".phons_n_am"));
            var pronunciation = british.Count > 0 || american.Count > 0
                ? new Pronunciation { British = british, American = american }
                : null;

            forms.Add(new InflectionForm { Label = label, Form = form, Pronunciation = pronunciation });
        }

        return forms;
    }

    private static string? ExtractGrammar(IElement senseElement) =>
        senseElement.Children.FirstOrDefault(c => c.ClassList.Contains("grammar"))?.TextContent.Trim() is { } raw
            ? raw.Replace("[", "").Replace("]", "").Trim() is { Length: > 0 } cleaned ? cleaned : null
            : null;

    private static string? ExtractRegister(IElement senseElement)
    {
        var raw = senseElement.Children.FirstOrDefault(c => c.ClassList.Contains("labels"))?.TextContent.Trim();
        if (string.IsNullOrEmpty(raw))
        {
            return null;
        }

        var cleaned = raw.Trim('(', ')').Trim();
        return string.IsNullOrEmpty(cleaned) ? null : cleaned;
    }

    [GeneratedRegex(@"^ox[35]ksym_([a-c][12])$")]
    private static partial Regex KeywordSymbolRegex();
}
