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
            WordForms = ExtractInflections(entryElement),
            Pronunciations = ExtractPronunciations(webtop),
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

        var britishBlock = webtop.QuerySelector(".phons_br");
        var americanBlock = webtop.QuerySelector(".phons_n_am");

        var british = ExtractText(britishBlock, ".phon");
        var american = ExtractText(americanBlock, ".phon");

        if (british is null && american is null)
        {
            return [];
        }

        var britishAudio = britishBlock?.QuerySelector(".sound")?.GetAttribute("data-src-mp3");
        var americanAudio = americanBlock?.QuerySelector(".sound")?.GetAttribute("data-src-mp3");

        return
        [
            new Pronunciation
            {
                British = british,
                BritishAudioUrl = NullIfEmpty(britishAudio) is { } br ? StripQueryString(br) : null,
                American = american,
                AmericanAudioUrl = NullIfEmpty(americanAudio) is { } am ? StripQueryString(am) : null,
            },
        ];
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

    private static string? ExtractInflections(IElement topGroup)
    {
        var raw = ExtractText(topGroup, ".inflections");
        if (raw is null)
        {
            return null;
        }

        var text = SurroundingParensRegex().Replace(raw, "").Trim();
        return string.IsNullOrEmpty(text) ? null : text;
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

    [GeneratedRegex(@"^\(+|\)+$")]
    private static partial Regex SurroundingParensRegex();

    [GeneratedRegex(@"^ox[35]ksym_([a-c][12])$")]
    private static partial Regex KeywordSymbolRegex();
}
