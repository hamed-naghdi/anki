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
        var entries = ParseEntries(html);
        if (entries.Count == 0)
        {
            return new DictionaryLookupResult<OxfordDictionaryEntry>
            {
                Word = word,
                Source = SourceName,
                Error = $"No entries found for '{word}'",
            };
        }

        return new DictionaryLookupResult<OxfordDictionaryEntry> { Word = word, Source = SourceName, Entries = entries };
    }

    /// <summary>Just the entries on one page, with no word/error wrapper - used both by <see cref="Parse"/> and to fold in a sibling homograph's own page (see <see cref="FindOtherHomographUrls"/>).</summary>
    public static List<OxfordDictionaryEntry> ParseEntries(string html)
    {
        var parser = new HtmlParser();
        using var document = parser.ParseDocument(html);

        // Each homograph (e.g. "read" the verb vs. "read" the noun) is one .entry. Its senses
        // are NOT nested inside .top-g - .top-g only holds the header (headword/pronunciation/
        // symbols); <ol class="senses_multiple"> is a sibling of .top-g under the same .entry.
        return document.QuerySelectorAll("#entryContent .entry").Select(ExtractEntry).ToList();
    }

    /// <summary>
    /// Oxford gives each homograph of a word (e.g. "walk" the verb vs. "walk" the noun) its own
    /// page, and a lookup only ever lands on one of them - there's no single page listing every
    /// homograph. The "Nearby words" sidebar (an alphabetical-neighbor list meant for browsing) is
    /// the only place the site cross-references them: since homographs share identical spelling,
    /// they always sort adjacent to each other and to the page currently open (marked "selected"),
    /// so every other "Nearby words" row whose own headword text (ignoring its part-of-speech tag)
    /// matches the selected row's is another homograph's page to fetch.
    /// </summary>
    public static List<string> FindOtherHomographUrls(string html)
    {
        var parser = new HtmlParser();
        using var document = parser.ParseDocument(html);

        var nearby = document.QuerySelector(".nearby");
        var links = nearby is null ? Enumerable.Empty<IElement>() : nearby.QuerySelectorAll("a");

        var selected = links.FirstOrDefault(link => link.ClassList.Contains("selected"));
        var selectedWord = HeadwordText(selected);
        if (selectedWord is null)
        {
            return [];
        }

        var urls = new List<string>();

        foreach (var link in links)
        {
            if (link.ClassList.Contains("selected") || !string.Equals(HeadwordText(link), selectedWord, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var href = NullIfEmpty(link.GetAttribute("href"));
            if (href is not null)
            {
                urls.Add(href);
            }
        }

        return urls;
    }

    private static string? HeadwordText(IElement? link)
    {
        var headwordElement = link?.QuerySelector(".hwd");
        return headwordElement is null ? null : NullIfEmpty(ExtractTextExcluding(headwordElement, "pos"));
    }

    private static OxfordDictionaryEntry ExtractEntry(IElement entryElement)
    {
        // The first .top-g's .webtop is this entry's real header; a word's idioms can carry
        // their own mini top-g further down within the same .entry, which we don't want here.
        var webtop = entryElement.QuerySelector(".webtop");

        var (isKeyword, keywordLevel) = ExtractKeywordInfo(webtop);

        // An idiom's own <li class="sense"> lives inside its .idm-g wrapper and must not be
        // counted as a literal meaning of the headword - see ExtractIdioms.
        var senses = entryElement.QuerySelectorAll(".sense")
            .Where(sense => sense.Closest(".idm-g") is null)
            .Select(ExtractSense)
            .Where(sense => sense is not null)
            .Select(sense => sense!)
            .ToList();

        return new OxfordDictionaryEntry
        {
            Headword = ExtractText(webtop, ".headword") ?? "",
            PartOfSpeech = ExtractText(webtop, ".pos"),
            Pronunciations = ExtractPronunciations(webtop),
            InflectionForms = ExtractInflectionForms(entryElement),
            IsKeyword = isKeyword,
            KeywordLevel = keywordLevel,
            AcademicWordLists = ExtractAcademicWordLists(webtop),
            Senses = senses,
            Etymology = ExtractEtymology(entryElement),
            Idioms = ExtractIdioms(entryElement),
            Hyphenation = ExtractPhrasalVerbPattern(entryElement),
        };
    }

    /// <summary>
    /// A phrasal verb's own page (e.g. "cross-out") prints its object-placement pattern in a
    /// ".pv-g .pv" span, e.g. "cross something &lt;span class="pvarr"/&gt;out/through" in the raw
    /// markup - the "/&gt;" is meaningless in HTML5 (only void/foreign elements self-close), so
    /// AngleSharp - like a real browser - keeps .pvarr open and nests "out/through" inside it rather
    /// than treating it as a sibling; the object-position arrow itself is a CSS background icon on
    /// that (otherwise empty) span, not real text. Both are accounted for below: substitute "↔" for
    /// the icon, then keep the element's own (mis-nested) text rather than discarding it. A page can
    /// carry several .pv-g groups (one per distinct object-placement pattern, e.g. "put on"'s "put
    /// somebody on" vs. "put something on"); only the first is used, same as every other entry-level
    /// field here already collapses a multi-pattern page down to one value.
    /// </summary>
    private static string? ExtractPhrasalVerbPattern(IElement entryElement)
    {
        var pv = entryElement.QuerySelector(".pv-g .pv");
        if (pv is null)
        {
            return null;
        }

        var text = string.Concat(pv.ChildNodes.Select(node =>
            node is IElement element && element.ClassList.Contains("pvarr")
                ? " ↔ " + element.TextContent
                : node.TextContent));

        return NullIfEmpty(WhitespaceRegex().Replace(text, " ").Trim());
    }

    /// <summary>
    /// Idioms built on the headword (e.g. "walk" -> "float on air") get their own .idm-g wrapper,
    /// each with an <see cref="ExtractSense"/>-shaped &lt;li class="sense"&gt; of its own - reused
    /// here instead of duplicated, since an idiom's meaning is structured identically to a regular
    /// one, just under a phrase instead of a sense number.
    /// </summary>
    private static List<OxfordIdiom> ExtractIdioms(IElement entryElement)
    {
        var idioms = new List<OxfordIdiom>();

        foreach (var group in entryElement.QuerySelectorAll(".idm-g"))
        {
            var idmElement = group.QuerySelector(".idm");
            var phrase = NullIfEmpty(idmElement?.TextContent.Trim());
            if (phrase is null)
            {
                continue;
            }

            var senses = group.QuerySelectorAll(".sense")
                .Select(ExtractSense)
                .Where(sense => sense is not null)
                .Select(sense => sense!)
                .ToList();

            idioms.Add(new OxfordIdiom
            {
                Phrase = phrase,
                CefrLevel = NullIfEmpty(idmElement?.GetAttribute("cefr")),
                Senses = senses,
            });
        }

        return idioms;
    }

    private static string? ExtractEtymology(IElement entryElement)
    {
        var wordOrigin = entryElement.QuerySelectorAll(".unbox")
            .FirstOrDefault(unbox => unbox.GetAttribute("unbox") == "wordorigin");

        return NullIfEmpty(wordOrigin?.QuerySelector(".body")?.TextContent.Trim());
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
            // A regular numbered sense has .def as a direct child; an idiom's (simpler) sense
            // nests it one level down inside .sensetop instead - searching by descendant rather
            // than direct child handles both without special-casing idioms here.
            Definition = ExtractText(senseElement, ".def"),
            Grammar = ExtractGrammar(senseElement),
            Register = ExtractRegister(senseElement),
            Synonyms = ExtractCrossReferenceWords(senseElement, "syn"),
            Antonyms = ExtractCrossReferenceWords(senseElement, "opp"),
            Patterns = patterns,
            CefrLevel = cefrLevel,
            IsKeyword = isKeyword,
            Examples = examples,
            Topics = ExtractTopics(senseElement),
            CollocationGroup = ExtractCollocationGroup(senseElement),
        };

        var isMeaningful = sense.Definition is not null || sense.Examples.Count > 0 || sense.Patterns.Count > 0;
        return isMeaningful ? sense : null;
    }

    private static List<OxfordSenseTopic> ExtractTopics(IElement senseElement)
    {
        var topics = new List<OxfordSenseTopic>();

        foreach (var topic in senseElement.QuerySelectorAll(".topic-g .topic"))
        {
            var name = ExtractText(topic, ".topic_name");
            if (name is null)
            {
                continue;
            }

            topics.Add(new OxfordSenseTopic { Name = name, CefrLevel = ExtractText(topic, ".topic_cefr") });
        }

        return topics;
    }

    /// <summary>
    /// The "Oxford Collocations Dictionary" preview box alternates a role-label span
    /// (".unbox", e.g. "adverb") with the ".collocs_list" of collocates for that role; a literal
    /// "…" item marks a truncated list, not a real collocate.
    /// </summary>
    private static OxfordCollocationGroup? ExtractCollocationGroup(IElement senseElement)
    {
        var snippet = senseElement.QuerySelectorAll(".unbox")
            .FirstOrDefault(unbox => unbox.GetAttribute("unbox") == "snippet");
        var body = snippet?.QuerySelector(".body");
        if (body is null)
        {
            return null;
        }

        var sections = new List<CollocationSection>();
        string? heading = null;
        var collocations = new List<Collocation>();
        var isTruncated = false;

        foreach (var child in body.Children)
        {
            if (child.ClassList.Contains("unbox"))
            {
                if (heading is not null && collocations.Count > 0)
                {
                    sections.Add(new CollocationSection { Heading = heading, Collocations = [.. collocations] });
                }

                heading = child.TextContent.Trim();
                collocations.Clear();
            }
            else if (child.ClassList.Contains("collocs_list"))
            {
                foreach (var item in child.QuerySelectorAll("li"))
                {
                    var text = item.TextContent.Trim();
                    if (text == "…")
                    {
                        isTruncated = true;
                    }
                    else if (text.Length > 0)
                    {
                        collocations.Add(new Collocation { Phrase = text });
                    }
                }
            }
        }

        if (heading is not null && collocations.Count > 0)
        {
            sections.Add(new CollocationSection { Heading = heading, Collocations = collocations });
        }

        if (sections.Count == 0)
        {
            return null;
        }

        return new OxfordCollocationGroup
        {
            Sections = sections,
            IsTruncated = isTruncated,
            FullEntryUrl = NullIfEmpty(snippet!.QuerySelector(".xref_to_full_entry a")?.GetAttribute("href")),
        };
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

    /// <summary>
    /// The plain word(s) out of a sense's "opposite"/"synonym" cross-reference line, e.g.
    /// <c>&lt;span class="xrefs" xt="opp"&gt;&lt;span class="prefix"&gt;opposite&lt;/span&gt; &lt;a&gt;&lt;span class="xr-g"&gt;&lt;span class="xh"&gt;untrue&lt;/span&gt;&lt;/span&gt;&lt;/a&gt;&lt;/span&gt;</c>
    /// (several words appear as several ".xh" spans, comma-separated) - <paramref name="crossReferenceType"/>
    /// is Oxford's own "xt" value ("opp" for antonyms, "syn" for synonyms), which also covers
    /// unrelated "see also" cross-references (xt="see") that this deliberately ignores by only
    /// matching the type asked for.
    /// </summary>
    private static List<string> ExtractCrossReferenceWords(IElement senseElement, string crossReferenceType)
    {
        var words = new List<string>();

        foreach (var xrefs in senseElement.QuerySelectorAll(".xrefs"))
        {
            if (xrefs.GetAttribute("xt") != crossReferenceType)
            {
                continue;
            }

            foreach (var headword in xrefs.QuerySelectorAll(".xh"))
            {
                var text = headword.TextContent.Trim();
                if (text.Length > 0)
                {
                    words.Add(text);
                }
            }
        }

        return words;
    }

    [GeneratedRegex(@"^ox[35]ksym_([a-c][12])$")]
    private static partial Regex KeywordSymbolRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
