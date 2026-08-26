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

        var wordFamily = ExtractWordFamily(document);
        var etymologyByHomnum = ExtractEtymologyByHomnum(document);

        var entries = document
            .QuerySelectorAll(".entry_content .dictionary .dictentry")
            .Select(dictEntry => dictEntry.QuerySelector(".dictlink .Entry"))
            .Where(ldEntry => ldEntry is not null)
            .Select(ldEntry => ExtractEntry(ldEntry!, wordFamily, etymologyByHomnum))
            .ToList();

        return new DictionaryLookupResult<LongmanDictionaryEntry> { Word = word, Source = SourceName, Entries = entries };
    }

    private static LongmanDictionaryEntry ExtractEntry(
        IElement ldEntry, IReadOnlyList<WordFamilyMember> wordFamily, IReadOnlyDictionary<string, string> etymologyByHomnum)
    {
        var headElement = ldEntry.QuerySelector(".Head");
        var headword = ExtractText(headElement, ".HWD") ?? "";
        var homnum = ExtractText(headElement, ".HOMNUM") ?? "";

        return new LongmanDictionaryEntry
        {
            Headword = headword,
            PartOfSpeech = ExtractText(headElement, ".POS"),
            HomographNumber = NullIfEmpty(homnum),
            Hyphenation = ExtractHyphenation(headElement),
            Grammar = ExtractGrammar(headElement),
            Pronunciations = ExtractPronunciations(headElement),
            InflectionForms = ExtractInflectionForms(headElement),
            FrequencyLabels = ExtractFrequencyLabels(headElement),
            Senses = ExtractSenses(ldEntry, headword).ToList(),
            Etymology = etymologyByHomnum.GetValueOrDefault(homnum),
            Idioms = ExtractIdioms(ldEntry),
            WordFamily = wordFamily,
            CollocationGroups = ExtractCollocationGroups(ldEntry),
            ThesaurusSections = ExtractThesaurusSections(ldEntry),
        };
    }

    /// <summary>
    /// A numbered .Sense either carries its definition directly, or - when Longman splits it into
    /// lettered .Subsense children (e.g. "break" sense 1 -> "1a", "1b") - carries none of its own
    /// and all real content lives one level down. Each subsense is flattened into its own
    /// LongmanSense here (labeled "1a"/"1b") rather than nested, so none of them are silently
    /// dropped the way only the first one used to be when .DEF/.EXAMPLE were read straight off the
    /// parent via descendant selectors.
    /// </summary>
    private static IEnumerable<LongmanSense> ExtractSenses(IElement ldEntry, string headword)
    {
        foreach (var senseElement in ldEntry.Children.Where(child => child.ClassList.Contains("Sense")))
        {
            var senseNumber = DirectChildText(senseElement, "sensenum");
            var guideword = NullIfHeadword(DirectChildText(senseElement, "ACTIV"), headword);
            var signpost = DirectChildText(senseElement, "SIGNPOST");
            var field = DirectChildText(senseElement, "FIELD");

            var subsenses = senseElement.Children.Where(child => child.ClassList.Contains("Subsense")).ToList();

            if (subsenses.Count == 0)
            {
                var sense = BuildSense(senseElement, senseNumber, guideword, signpost, field);
                if (sense is not null)
                {
                    yield return sense;
                }

                continue;
            }

            foreach (var subsense in subsenses)
            {
                var letter = DirectChildText(subsense, "sensenum")?.TrimEnd(')');
                var label = senseNumber is null ? letter : $"{senseNumber}{letter}";
                var subField = DirectChildText(subsense, "FIELD") ?? field;

                var sense = BuildSense(subsense, label, guideword, signpost, subField);
                if (sense is not null)
                {
                    yield return sense;
                }
            }
        }
    }

    private static LongmanSense? BuildSense(IElement scope, string? senseLabel, string? guideword, string? signpost, string? field)
    {
        var sense = new LongmanSense
        {
            Definition = ExtractText(scope, ".DEF"),
            Grammar = ExtractGrammar(scope),
            Register = ExtractText(scope, ".REGISTERLAB"),
            Synonyms = ExtractSynOrOpp(scope, ".SYN"),
            Antonyms = ExtractSynOrOpp(scope, ".OPP"),
            Examples = ExtractExamples(scope),
            SenseLabel = senseLabel,
            Guideword = guideword,
            Signpost = signpost,
            Field = field,
            ImageUrl = ExtractSenseImage(scope),
        };

        var isMeaningful = sense.Definition is not null
            || sense.Examples.Count > 0
            || sense.Synonyms.Count > 0
            || sense.Antonyms.Count > 0
            || sense.ImageUrl is not null;

        return isMeaningful ? sense : null;
    }

    /// <summary>An illustration (e.g. "frying pan", "corkscrew") is a plain img sitting directly in the sense/subsense, not wrapped in any dedicated class - so it's found positionally rather than by selector.</summary>
    private static string? ExtractSenseImage(IElement scope)
    {
        var src = scope.Children.FirstOrDefault(c => c.TagName.Equals("IMG", StringComparison.OrdinalIgnoreCase))?.GetAttribute("src");
        return string.IsNullOrEmpty(src) ? null : StripQueryString(src);
    }

    /// <summary>
    /// Idioms and phrasal verbs built on the headword - Longman only cross-references these (a
    /// title + a link to their own page), never embeds their definition here. Most are wrapped in
    /// their own .SubEntry/.PhrVbEntry box, but Longman also numbers some as a plain .Sense/
    /// .Subsense whose entire content is a "→ some other entry" .Crossref (e.g. "frying pan" sense
    /// 2 -> "out of the frying pan and into the fire", "paper" sense 3 -> "papers") - those carry no
    /// DEF, so <see cref="BuildSense"/> would otherwise treat them as empty and drop them silently.
    /// </summary>
    private static List<LongmanIdiom> ExtractIdioms(IElement ldEntry)
    {
        var idioms = new List<LongmanIdiom>();
        var seenPhrases = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var wrapper in ldEntry.QuerySelectorAll(".SubEntry, .PhrVbEntry"))
        {
            AddIdiom(wrapper.QuerySelector("a.crossRef"), wrapper, idioms, seenPhrases);
        }

        foreach (var senseWrapper in ldEntry.QuerySelectorAll(".Sense, .Subsense"))
        {
            if (senseWrapper.Children.Any(c => c.ClassList.Contains("DEF")))
            {
                continue;
            }

            var crossref = senseWrapper.Children.FirstOrDefault(c => c.ClassList.Contains("Crossref"));
            if (crossref is not null)
            {
                AddIdiom(crossref.QuerySelector("a.crossRef"), crossref, idioms, seenPhrases);
            }
        }

        return idioms;
    }

    private static void AddIdiom(IElement? link, IElement scope, List<LongmanIdiom> idioms, HashSet<string> seenPhrases)
    {
        if (link is null)
        {
            return;
        }

        var phrase = ExtractText(scope, ".REFHWD") ?? NullIfEmpty(link.TextContent.Trim());
        if (phrase is null || !seenPhrases.Add(phrase))
        {
            return;
        }

        idioms.Add(new LongmanIdiom { Phrase = phrase, Url = NullIfEmpty(link.GetAttribute("href")) });
    }

    /// <summary>
    /// Word origin boxes (.etym) are page-level furniture, sibling to the .dictentry blocks rather
    /// than nested inside any of them - each carries its own mini .Head with the HOMNUM it belongs
    /// to, since not every homograph on a page necessarily gets one (e.g. "break" the verb has an
    /// origin box, "break" the noun doesn't). Keyed by that HOMNUM ("" when a page has none) so
    /// each entry can look up its own.
    /// </summary>
    private static Dictionary<string, string> ExtractEtymologyByHomnum(IDocument document)
    {
        var etymologyByHomnum = new Dictionary<string, string>();

        foreach (var etym in document.QuerySelectorAll(".dictionary > .etym"))
        {
            var language = ExtractText(etym, ".LANG");
            var origin = ExtractText(etym, ".ORIGIN");

            var etymology = (language, origin) switch
            {
                (not null, not null) => $"{language}: {origin}",
                (not null, null) => language,
                (null, not null) => origin,
                _ => null,
            };

            if (etymology is null)
            {
                continue;
            }

            var homnum = ExtractText(etym, ".HOMNUM") ?? "";
            etymologyByHomnum.TryAdd(homnum, etymology);
        }

        return etymologyByHomnum;
    }

    /// <summary>
    /// The page's "Word family" box lists related words in other parts of speech (e.g. "break" the
    /// verb -> "breakage" noun, "breakable"/"unbreakable" adjective). It's shared furniture above
    /// every homograph on the page, not specific to one entry, so it's parsed once in <see cref="Parse"/>.
    /// </summary>
    private static List<WordFamilyMember> ExtractWordFamily(IDocument document)
    {
        var container = document.QuerySelector(".wordfams");
        if (container is null)
        {
            return [];
        }

        var members = new List<WordFamilyMember>();
        string? currentPartOfSpeech = null;

        foreach (var element in container.Children)
        {
            if (element.ClassList.Contains("pos"))
            {
                currentPartOfSpeech = NullIfEmpty(element.TextContent.Trim().Trim('(', ')').Trim());
                continue;
            }

            if (currentPartOfSpeech is null)
            {
                continue;
            }

            if (element.ClassList.Contains("opp"))
            {
                var opposite = NullIfEmpty(element.QuerySelector("a")?.TextContent.Trim());
                if (opposite is not null)
                {
                    members.Add(new WordFamilyMember { PartOfSpeech = currentPartOfSpeech, Word = opposite, IsOpposite = true });
                }
            }
            else if (element.ClassList.Contains("crossRef") || element.ClassList.Contains("w"))
            {
                var word = NullIfEmpty(element.TextContent.Trim());
                if (word is not null)
                {
                    members.Add(new WordFamilyMember { PartOfSpeech = currentPartOfSpeech, Word = word });
                }
            }
        }

        return members;
    }

    /// <summary>
    /// A "COLLOCATIONS" box groups collocations under one or more grammar-pattern sections (e.g.
    /// "break + NOUN"), tied to one sense only by a free-text "Meaning N: ..." heading Longman
    /// prints itself - kept as a display hint rather than matched back to a specific ISense, since
    /// it's a paraphrase, not the sense's own definition text.
    /// </summary>
    private static List<LongmanCollocationGroup> ExtractCollocationGroups(IElement ldEntry)
    {
        var groups = new List<LongmanCollocationGroup>();

        foreach (var box in ldEntry.QuerySelectorAll(".ColloBox"))
        {
            var meaningHint = box.Children.FirstOrDefault(c => c.ClassList.Contains("HEADING"))?.TextContent.Trim();
            meaningHint = NullIfEmpty(meaningHint?.TrimStart('–', ' ').Trim());

            var sections = new List<CollocationSection>();

            foreach (var section in box.Children.Where(c => c.ClassList.Contains("Section")))
            {
                var heading = ExtractText(section, ".SECHEADING");
                if (heading is null)
                {
                    continue;
                }

                var collocations = new List<Collocation>();

                foreach (var collocate in section.Children.Where(c => c.ClassList.Contains("Collocate")))
                {
                    var phrase = ExtractText(collocate, ".COLLOC");
                    if (phrase is null)
                    {
                        continue;
                    }

                    var gloss = collocate.Children.FirstOrDefault(c => c.ClassList.Contains("COLLGLOSS"))
                        ?.TextContent.Trim(' ', '(', ')', '=');

                    collocations.Add(new Collocation
                    {
                        Phrase = phrase,
                        Gloss = NullIfEmpty(gloss),
                        Example = ExtractText(collocate, ".EXAMPLE"),
                    });
                }

                if (collocations.Count > 0)
                {
                    sections.Add(new CollocationSection { Heading = heading, Collocations = collocations });
                }
            }

            if (sections.Count > 0)
            {
                groups.Add(new LongmanCollocationGroup { MeaningHint = meaningHint, Sections = sections });
            }
        }

        return groups;
    }

    /// <summary>A "THESAURUS" box lists near-synonyms grouped by shade of meaning, each with its own mini part-of-speech/definition/examples.</summary>
    private static List<ThesaurusSection> ExtractThesaurusSections(IElement ldEntry)
    {
        var sections = new List<ThesaurusSection>();

        foreach (var thesBox in ldEntry.QuerySelectorAll(".ThesBox"))
        {
            foreach (var section in thesBox.Children.Where(c => c.ClassList.Contains("Section")))
            {
                var heading = ExtractText(section, ".SECHEADING");
                if (heading is null)
                {
                    continue;
                }

                var entries = new List<ThesaurusEntry>();

                foreach (var exponent in section.Children.Where(c => c.ClassList.Contains("Exponent")))
                {
                    var word = ExtractText(exponent, ".EXP");
                    if (word is null)
                    {
                        continue;
                    }

                    var examples = exponent.Children
                        .Where(c => c.ClassList.Contains("EXAMPLE"))
                        .Select(e => e.TextContent.Trim())
                        .Where(t => t.Length > 0)
                        .ToList();

                    entries.Add(new ThesaurusEntry
                    {
                        Word = word,
                        PartOfSpeech = ExtractText(exponent, ".POS"),
                        Grammar = ExtractGrammar(exponent),
                        Definition = ExtractText(exponent, ".DEF"),
                        Examples = examples,
                    });
                }

                if (entries.Count > 0)
                {
                    sections.Add(new ThesaurusSection { Heading = heading, Entries = entries });
                }
            }
        }

        return sections;
    }

    private static string? DirectChildText(IElement scope, string className) =>
        NullIfEmpty(scope.Children.FirstOrDefault(c => c.ClassList.Contains(className))?.TextContent.Trim());

    /// <summary>Longman bolds the headword itself right before a definition (e.g. subsense "BREAK") as a purely visual re-introduction, not a meaningful guideword - only a value that differs from the headword is one.</summary>
    private static string? NullIfHeadword(string? value, string headword) =>
        value is not null && !string.Equals(value, headword, StringComparison.OrdinalIgnoreCase) ? value : null;

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

    /// <summary>
    /// The headword's own pronunciation only - inflected forms' pronunciations live on their own
    /// InflectionForm instead. Multi-word headwords built entirely from already-defined component
    /// words (e.g. "frying pan", "washing machine") print no .PronCodes/IPA line at all - Longman
    /// considers the pronunciation obvious - but still record the audio buttons, so those still
    /// need to come through rather than being dropped along with the (absent) IPA.
    /// </summary>
    private static List<Pronunciation> ExtractPronunciations(IElement? headElement)
    {
        if (headElement is null)
        {
            return [];
        }

        var britishAudio = ExtractSpeakerAudio(headElement, "brefile");
        var americanAudio = ExtractSpeakerAudio(headElement, "amefile");

        var primaryPronCodes = headElement.Children.FirstOrDefault(c => c.ClassList.Contains("PronCodes"));
        var pronunciation = primaryPronCodes is null
            ? BuildAudioOnlyPronunciation(britishAudio, americanAudio)
            : BuildPronunciation(primaryPronCodes, label: null, britishAudio, americanAudio);

        return pronunciation is null ? [] : [pronunciation];
    }

    private static Pronunciation? BuildAudioOnlyPronunciation(string? britishAudioUrl, string? americanAudioUrl)
    {
        if (britishAudioUrl is null && americanAudioUrl is null)
        {
            return null;
        }

        List<PhoneticVariant> AudioOnlyVariant(string? url) => url is null ? [] : [new PhoneticVariant { Ipa = "", AudioUrl = url }];

        return new Pronunciation { Label = null, British = AudioOnlyVariant(britishAudioUrl), American = AudioOnlyVariant(americanAudioUrl) };
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
