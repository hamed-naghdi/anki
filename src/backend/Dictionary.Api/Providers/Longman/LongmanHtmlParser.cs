using System.Text.RegularExpressions;
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
public static partial class LongmanHtmlParser
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
            WordForms = ExtractWordForms(headElement),
            Grammar = ExtractGrammar(headElement),
            Pronunciations = ExtractPronunciations(headElement),
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

    private static List<Pronunciation> ExtractPronunciations(IElement? headElement)
    {
        if (headElement is null)
        {
            return [];
        }

        var pronunciations = new List<Pronunciation>();

        var primaryPronCodes = headElement.Children.FirstOrDefault(c => c.ClassList.Contains("PronCodes"));
        if (primaryPronCodes is not null)
        {
            var britishAudio = ExtractSpeakerAudio(headElement, "brefile");
            var americanAudio = ExtractSpeakerAudio(headElement, "amefile");
            var pronunciation = BuildPronunciation(primaryPronCodes, label: null, britishAudio, americanAudio);
            if (pronunciation is not null)
            {
                pronunciations.Add(pronunciation);
            }
        }

        // Some inflected forms (e.g. a verb's past tense) are pronounced differently from the
        // base form and carry their own nested .PronCodes inside .Inflections.
        var inflections = headElement.Children.FirstOrDefault(c => c.ClassList.Contains("Inflections"));
        if (inflections is not null)
        {
            foreach (var pronCodes in inflections.QuerySelectorAll(".PronCodes"))
            {
                var label = pronCodes.PreviousElementSibling is { } labelHost
                    ? ExtractText(labelHost, ".infllab")
                    : null;
                var pronunciation = BuildPronunciation(pronCodes, label, britishAudioUrl: null, americanAudioUrl: null);
                if (pronunciation is not null)
                {
                    pronunciations.Add(pronunciation);
                }
            }
        }

        return pronunciations;
    }

    private static Pronunciation? BuildPronunciation(
        IElement pronCodes, string? label, string? britishAudioUrl, string? americanAudioUrl)
    {
        var british = ExtractText(pronCodes, ".PRON");
        var amevarElement = pronCodes.QuerySelector(".AMEVARPRON");
        var american = amevarElement is null ? british : ExtractTextExcluding(amevarElement, ".neutral");

        if (british is null && american is null)
        {
            return null;
        }

        return new Pronunciation
        {
            Label = label,
            British = british,
            BritishAudioUrl = britishAudioUrl,
            American = american,
            AmericanAudioUrl = americanAudioUrl,
        };
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

    private static string? ExtractWordForms(IElement? headElement)
    {
        var raw = ExtractText(headElement, ".Inflections");
        if (raw is null)
        {
            return null;
        }

        var text = SurroundingParensRegex().Replace(raw, "").Trim();
        return string.IsNullOrEmpty(text) ? null : text;
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

    [GeneratedRegex(@"^\(+|\)+$")]
    private static partial Regex SurroundingParensRegex();
}
