using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using Dictionary.Api.Models;
using Dictionary.Api.Providers.Longman.Models;
using static Dictionary.Api.Providers.HtmlExtractionHelpers;

namespace Dictionary.Api.Providers.Longman;

/// <summary>
/// Parses a Longman Learner's Dictionary entry page (ldoceonline.com) into Longman's own model
/// types. Pure HTML-in, model-out - no HTTP - so it can be tested against saved fixtures.
/// </summary>
public static class LongmanHtmlParser
{
    public const string SourceName = "Longman";

    public static DictionaryLookupResult<LongmanDictionaryEntry> Parse(string word, string html)
    {
        var parser = new HtmlParser();
        using var document = parser.ParseDocument(html);

        if (document.QuerySelector(".entry_content .dictionary") is null)
        {
            return new DictionaryLookupResult<LongmanDictionaryEntry>
            {
                Word = word,
                Source = SourceName,
                Error = $"No entries found for '{word}'",
            };
        }

        var entries = document
            .QuerySelectorAll(".entry_content .dictionary .dictentry")
            .Select(dictEntry => dictEntry.QuerySelector(".dictlink .Entry"))
            .Where(ldEntry => ldEntry is not null)
            .Select(ldEntry => ExtractEntry(ldEntry!))
            .ToList();

        return new DictionaryLookupResult<LongmanDictionaryEntry> { Word = word, Source = SourceName, Entries = entries };
    }

    private static LongmanDictionaryEntry ExtractEntry(IElement ldEntry)
    {
        var headElement = ldEntry.QuerySelector(".Head");

        var senses = ldEntry.Children
            .Where(child => child.ClassList.Contains("Sense"))
            .Select(ExtractSense)
            .Where(sense => sense is not null)
            .Select(sense => sense!)
            .ToList();

        return new LongmanDictionaryEntry
        {
            PartOfSpeech = ExtractText(headElement, ".POS"),
            Hyphenation = ExtractHyphenation(headElement),
            Grammar = ExtractGrammar(headElement),
            Pronunciations = ExtractPronunciations(headElement),
            InflectionForms = ExtractInflectionForms(headElement),
            FrequencyLabels = ExtractFrequencyLabels(headElement),
            Senses = senses,
        };
    }

    private static LongmanSense? ExtractSense(IElement senseElement)
    {
        var examples = ExtractExamples(senseElement);

        var sense = new LongmanSense
        {
            Definition = ExtractText(senseElement, ".DEF"),
            Grammar = ExtractGrammar(senseElement),
            Register = ExtractText(senseElement, ".REGISTERLAB"),
            Synonyms = ExtractSynOrOpp(senseElement, ".SYN"),
            Antonyms = ExtractSynOrOpp(senseElement, ".OPP"),
            Examples = examples,
        };

        var isMeaningful = sense.Definition is not null
            || sense.Examples.Count > 0
            || sense.Synonyms.Count > 0
            || sense.Antonyms.Count > 0;

        return isMeaningful ? sense : null;
    }

    /// <summary>
    /// Walks a sense's plain/collocation/grammar-pattern example groups. A GramExa's PROPFORM*
    /// label (e.g. "curiosity about") is attached directly to the examples inside that group,
    /// since that's the specific set of examples it actually describes.
    /// </summary>
    private static List<LongmanExample> ExtractExamples(IElement senseElement)
    {
        var examples = new List<LongmanExample>();

        foreach (var child in senseElement.Children)
        {
            if (child.ClassList.Contains("EXAMPLE"))
            {
                examples.Add(ExtractExample(child));
            }
            else if (child.ClassList.Contains("ColloExa"))
            {
                var collocation = ExtractText(child, ".COLLO");
                var note = collocation is null ? null : $"Collocation: {collocation}";
                var nested = child.Children.Where(c => c.ClassList.Contains("EXAMPLE")).ToList();

                if (nested.Count > 0)
                {
                    examples.AddRange(nested.Select(ex => ExtractExample(ex, note)));
                }
                else if (collocation is not null)
                {
                    examples.Add(new LongmanExample
                    {
                        Segments = [new TextSegment { Text = collocation, IsEmphasized = false }],
                        Note = "Collocation",
                    });
                }
            }
            else if (child.ClassList.Contains("GramExa"))
            {
                // Longman uses several PROPFORM* variants (PROPFORMPREP, PROPFORMSUBJ, ...)
                // depending on the grammar pattern, so match on the class prefix rather than
                // one exact class name.
                var propForm = child.Children
                    .FirstOrDefault(c => c.ClassList.Any(cls => cls.StartsWith("PROPFORM", StringComparison.Ordinal)))
                    ?.TextContent?.Trim();
                var pattern = string.IsNullOrEmpty(propForm) ? null : propForm;

                var nested = child.Children.Where(c => c.ClassList.Contains("EXAMPLE"));
                examples.AddRange(nested.Select(ex => ExtractExample(ex, pattern: pattern)));
            }
        }

        return examples;
    }

    private static LongmanExample ExtractExample(IElement exampleElem, string? note = null, string? pattern = null)
    {
        var audio = ExtractSpeakerAudio(exampleElem, accentClass: null);
        var glossary = ExtractText(exampleElem, ".GLOSS");
        var segments = ExtractTextSegments(exampleElem, "COLLOINEXA", ".GLOSS", ".speaker");

        var combinedNote = (note, glossary) switch
        {
            (not null, not null) => $"{note}; {glossary}",
            (not null, null) => note,
            (null, not null) => glossary,
            _ => null,
        };

        return new LongmanExample { Segments = segments, AudioUrl = audio, Note = combinedNote, Pattern = pattern };
    }

    /// <summary>The headword's own pronunciation only - inflected forms' pronunciations live on their own InflectionForm instead.</summary>
    private static List<Pronunciation> ExtractPronunciations(IElement? headElement)
    {
        var primaryPronCodes = headElement?.Children.FirstOrDefault(c => c.ClassList.Contains("PronCodes"));
        if (primaryPronCodes is null)
        {
            return [];
        }

        var britishAudio = ExtractSpeakerAudio(headElement!, "brefile");
        var americanAudio = ExtractSpeakerAudio(headElement!, "amefile");
        var pronunciation = BuildPronunciation(primaryPronCodes, label: null, britishAudio, americanAudio);
        return pronunciation is null ? [] : [pronunciation];
    }

    /// <summary>
    /// Longman can list more than one accepted pronunciation for the same accent in one .PRON/
    /// .AMEVARPRON span (e.g. "often" /ˈɒfən, ˈɒftən/), comma-separated, but only ever records one
    /// audio file per accent - so that audio attaches to the first variant only.
    /// </summary>
    private static Pronunciation? BuildPronunciation(
        IElement pronCodes, string? label, string? britishAudioUrl, string? americanAudioUrl)
    {
        var britishText = ExtractText(pronCodes, ".PRON");
        var amevarElement = pronCodes.QuerySelector(".AMEVARPRON");
        var americanText = amevarElement is null ? britishText : ExtractTextExcluding(amevarElement, ".neutral");

        var british = SplitVariants(britishText, britishAudioUrl);
        var american = SplitVariants(americanText, americanAudioUrl);

        if (british.Count == 0 && american.Count == 0)
        {
            return null;
        }

        return new Pronunciation { Label = label, British = british, American = american };
    }

    private static List<PhoneticVariant> SplitVariants(string? text, string? audioUrl)
    {
        if (string.IsNullOrEmpty(text))
        {
            return [];
        }

        var variants = new List<PhoneticVariant>();
        var parts = text.Split(',');
        foreach (var part in parts)
        {
            var ipa = part.Trim();
            if (ipa.Length > 0)
            {
                variants.Add(new PhoneticVariant { Ipa = ipa, AudioUrl = variants.Count == 0 ? audioUrl : null });
            }
        }

        return variants;
    }

    /// <summary>
    /// Walks .Inflections structurally rather than by a hardcoded list of grammatical-role class
    /// names (PTandPP, PRESPART, PLURALFORM, COMP, SUPERL, PASTTENSE, PASTPART, ...) - any direct
    /// child that isn't decorative punctuation (.neutral) or a person/number label (.LINKWORD,
    /// deferred - see "be") is one inflection entry; a following .PronCodes sibling attaches as
    /// that entry's pronunciation, present only when Longman considers it non-obvious from spelling.
    /// </summary>
    private static List<InflectionForm> ExtractInflectionForms(IElement? headElement)
    {
        var inflections = headElement?.Children.FirstOrDefault(c => c.ClassList.Contains("Inflections"));
        if (inflections is null)
        {
            return [];
        }

        var forms = new List<InflectionForm>();

        foreach (var child in inflections.Children)
        {
            if (child.ClassList.Contains("neutral") || child.ClassList.Contains("LINKWORD"))
            {
                continue;
            }

            if (child.ClassList.Contains("PronCodes"))
            {
                if (forms.Count > 0)
                {
                    var pronunciation = BuildPronunciation(child, label: null, britishAudioUrl: null, americanAudioUrl: null);
                    if (pronunciation is not null)
                    {
                        var last = forms[^1];
                        forms[^1] = new InflectionForm { Label = last.Label, Form = last.Form, Pronunciation = pronunciation };
                    }
                }

                continue;
            }

            var label = NullIfEmpty((ExtractText(child, ".infllab") ?? ExtractText(child, ".italic"))?.Trim());
            var form = ExtractTextExcluding(child, ".infllab, .italic, .neutral").Trim();
            if (form.Length > 0)
            {
                forms.Add(new InflectionForm { Label = label, Form = form });
            }
        }

        return forms;
    }

    /// <summary>
    /// Entry-level vocabulary badges: the 3-dot frequency band (.LEVEL, e.g. "Core vocabulary:
    /// High-frequency") and the top-1000 spoken/written word markers (.FREQ, "S1"/"W1").
    /// </summary>
    private static List<UsageLabel> ExtractFrequencyLabels(IElement? headElement)
    {
        if (headElement is null)
        {
            return [];
        }

        var labels = new List<UsageLabel>();

        var level = headElement.QuerySelector(".LEVEL");
        if (level is not null)
        {
            var code = level.TextContent.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                labels.Add(new UsageLabel { Code = code, Description = NullIfEmpty(level.GetAttribute("title")) });
            }
        }

        foreach (var freq in headElement.QuerySelectorAll(".FREQ"))
        {
            var code = freq.TextContent.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                labels.Add(new UsageLabel { Code = code, Description = NullIfEmpty(freq.GetAttribute("title")) });
            }
        }

        return labels;
    }

    private static string? ExtractHyphenation(IElement? headElement)
    {
        if (headElement is null)
        {
            return null;
        }

        return ExtractText(headElement, ".HYPHENATION") ?? ExtractText(headElement, ".PHRVBHWD");
    }

    private static string? ExtractGrammar(IElement? scope)
    {
        var raw = ExtractText(scope, ".GRAM");
        if (raw is null)
        {
            return null;
        }

        var cleaned = raw.Replace("[", "").Replace("]", "").Trim();
        return string.IsNullOrEmpty(cleaned) ? null : cleaned;
    }

    private static List<string> ExtractSynOrOpp(IElement senseElement, string selector)
    {
        var results = new List<string>();

        foreach (var element in senseElement.QuerySelectorAll(selector))
        {
            var text = ExtractTextExcluding(element, ".synopp");
            if (!string.IsNullOrEmpty(text))
            {
                results.Add(text);
            }
        }

        return results;
    }

    private static string? ExtractSpeakerAudio(IElement scope, string? accentClass)
    {
        var selector = accentClass is null ? ".speaker" : $".speaker.{accentClass}";
        var src = scope.QuerySelector(selector)?.GetAttribute("data-src-mp3");
        return string.IsNullOrEmpty(src) ? null : StripQueryString(src);
    }
}
