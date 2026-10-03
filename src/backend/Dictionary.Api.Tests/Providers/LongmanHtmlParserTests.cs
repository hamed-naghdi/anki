using Dictionary.Api.Models;
using Dictionary.Api.Providers.Longman;
using Dictionary.Api.Providers.Longman.Models;

namespace Dictionary.Api.Tests.Providers;

public class LongmanHtmlParserTests
{
    private static string LoadFixture(string fileName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName));

    private static string Text(LongmanExample example) =>
        string.Concat(example.Segments.Select(s => s.Text));

    // Every example sentence in a sense, whether it stands alone or sits inside a collocation/
    // grammar-pattern group.
    private static IEnumerable<LongmanExample> Sentences(IEnumerable<IExample> examples) =>
        examples.SelectMany(example => example switch
        {
            LongmanExample single => new[] { single },
            LongmanCollectionExample collocation => collocation.Examples,
            LongmanGrammarExample grammar => grammar.Examples,
            _ => throw new InvalidOperationException($"Unexpected example type {example.GetType().Name}"),
        });

    [Fact]
    public void Parse_CrossOutFixture_ExtractsHeadwordAndPatternFromPhrasalVerbHead()
    {
        var html = LoadFixture("longman-cross-out.html");

        var result = LongmanHtmlParser.Parse("cross out", html);

        var entry = Assert.Single(result.Entries);
        Assert.Equal("cross out", entry.Headword);
        Assert.Equal("phrasal verb", entry.PartOfSpeech);
        Assert.Equal("cross something ↔ out", entry.Hyphenation);
    }

    [Fact]
    public void Parse_LookUpFixture_ExtractsPerSensePhrasalVerbPatterns()
    {
        var html = LoadFixture("longman-look-up.html");

        var result = LongmanHtmlParser.Parse("look up", html);

        var entry = result.Entries[0];
        Assert.Equal("look up", entry.Headword);

        // Sense 1 ("things are looking up") is intransitive - no object placement to show.
        Assert.Null(entry.Senses[0].PhrasalVerbPattern);
        Assert.Equal("look something ↔ up", entry.Senses[1].PhrasalVerbPattern);
        Assert.Equal("look somebody ↔ up", entry.Senses[2].PhrasalVerbPattern);
    }

    [Fact]
    public void Parse_ExampleFixture_ReturnsNounEntryWithDefinition()
    {
        var html = LoadFixture("longman-example.html");

        var result = LongmanHtmlParser.Parse("example", html);

        Assert.Equal("example", result.Word);
        Assert.Equal("Longman", result.Source);
        Assert.Null(result.Error);
        Assert.NotEmpty(result.Entries);

        var entry = result.Entries[0];
        Assert.Equal("example", entry.Headword);
        Assert.Equal("noun", entry.PartOfSpeech);
        Assert.Equal("countable", entry.Grammar);

        var pronunciation = Assert.Single(entry.Pronunciations);
        Assert.Null(pronunciation.Label);
        var british = Assert.Single(pronunciation.British);
        var american = Assert.Single(pronunciation.American);
        Assert.False(string.IsNullOrWhiteSpace(british.Ipa));
        Assert.False(string.IsNullOrWhiteSpace(american.Ipa));
        Assert.NotNull(british.AudioUrl);
        Assert.NotNull(american.AudioUrl);

        Assert.NotEmpty(entry.Senses);
        var firstSense = entry.Senses[0];
        Assert.Contains("typical", firstSense.Definition);

        var grammarExample = Assert.IsType<LongmanGrammarExample>(Assert.Single(firstSense.Examples));
        Assert.Equal("example of", grammarExample.Pattern);
        var example = Assert.Single(grammarExample.Examples);
        Assert.Equal("Can anyone give me an example of a transitive verb?", Text(example));
    }

    [Fact]
    public void Parse_FryingPanFixture_ExtractsAudioOnlyPronunciationSenseImageAndCrossrefIdiom()
    {
        var html = LoadFixture("longman-frying-pan.html");

        var result = LongmanHtmlParser.Parse("frying pan", html);

        Assert.Null(result.Error);
        var entry = Assert.Single(result.Entries);
        Assert.Equal("countable", entry.Grammar);

        // "frying pan" prints audio buttons but no IPA line at all (Longman treats the
        // pronunciation as obvious from its already-defined component words) - both accents' audio
        // must still come through even though there's no .PronCodes to hang an IPA off of.
        var pronunciation = Assert.Single(entry.Pronunciations);
        var british = Assert.Single(pronunciation.British);
        var american = Assert.Single(pronunciation.American);
        Assert.Equal("", british.Ipa);
        Assert.Equal("", american.Ipa);
        Assert.NotNull(british.AudioUrl);
        Assert.NotNull(american.AudioUrl);

        var sense = Assert.Single(entry.Senses);
        Assert.Equal(
            "https://www.ldoceonline.com/media/english/illustration/frying_pan.jpg",
            sense.ImageUrl);

        // Sense 2 is nothing but "-> out of the frying pan and into the fire" - no DEF of its own,
        // so it must surface as an idiom cross-reference instead of being silently dropped.
        var idiom = Assert.Single(entry.Idioms);
        Assert.Equal("out of the frying pan and into the fire", idiom.Phrase);
    }

    [Fact]
    public void Parse_UnknownWord_ReturnsError()
    {
        var result = LongmanHtmlParser.Parse("zzzzznotaword", "<html><body>not found</body></html>");

        Assert.Empty(result.Entries);
        Assert.Equal("No entries found for 'zzzzznotaword'", result.Error);
    }

    [Fact]
    public void Parse_ShoppingFixture_ExtractsCollocationAndGlossExamples()
    {
        var html = LoadFixture("longman-shopping.html");

        var result = LongmanHtmlParser.Parse("shopping", html);

        Assert.Null(result.Error);
        var allExamples = result.Entries
            .SelectMany(entry => entry.Senses)
            .SelectMany(sense => sense.Examples)
            .ToList();

        var collocation = Assert.Single(
            allExamples.OfType<LongmanCollectionExample>(),
            example => example.Collection == "shopping expedition/trip");
        var collocationExample = Assert.Single(collocation.Examples);
        Assert.Contains("gone on", Text(collocationExample));
        Assert.Contains("shopping trip", Text(collocationExample));

        // A gloss inside the sentence ("(=went shopping and bought a lot of things)") is left out of
        // the sentence text itself.
        var glossedExample = Assert.Single(
            Sentences(allExamples),
            example => Text(example).Contains("shopping spree"));
        Assert.DoesNotContain("went shopping and bought", Text(glossedExample));
    }

    [Fact]
    public void Parse_TrueFixture_ExtractsSynonymsAntonymsAndRegister()
    {
        var html = LoadFixture("longman-true.html");

        var result = LongmanHtmlParser.Parse("true", html);

        Assert.Null(result.Error);
        var senses = result.Entries.SelectMany(entry => entry.Senses).ToList();

        Assert.Contains(senses, sense => sense.Register is not null);
        Assert.Contains(senses, sense => sense.Synonyms.Contains("real"));
        Assert.Contains(senses, sense => sense.Antonyms.Contains("false"));

        Assert.Equal(["1", "2", "3"], result.Entries.Select(entry => entry.HomographNumber).Where(n => n is not null));
    }

    [Fact]
    public void Parse_BigFixture_ExtractsInflectionForms()
    {
        var html = LoadFixture("longman-big.html");

        var result = LongmanHtmlParser.Parse("big", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        Assert.Contains(entry.InflectionForms, f => f.Label == "comparative" && f.Form == "bigger");
        Assert.Contains(entry.InflectionForms, f => f.Label == "superlative" && f.Form == "biggest");
    }

    [Fact]
    public void Parse_CuriosityFixture_EmphasizesCollocatesAndAttachesPatternToItsOwnExample()
    {
        var html = LoadFixture("longman-curiosity.html");

        var result = LongmanHtmlParser.Parse("curiosity", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var pronunciation = Assert.Single(entry.Pronunciations);
        var british = Assert.Single(pronunciation.British).Ipa;
        var american = Assert.Single(pronunciation.American).Ipa;
        Assert.NotEqual(british, american);

        Assert.Contains(entry.FrequencyLabels, label => label.Code == "●●○" && label.Description == "Core vocabulary: Medium-frequency");

        var firstSense = entry.Senses[0];

        // "curiosity about" describes ONLY the "natural curiosity about the world" example,
        // not the whole sense - it must not leak onto unrelated examples in the same sense.
        var grammarExample = Assert.Single(firstSense.Examples.OfType<LongmanGrammarExample>());
        Assert.Equal("curiosity about", grammarExample.Pattern);
        var patternedExample = Assert.Single(grammarExample.Examples);
        Assert.Contains("natural", Text(patternedExample));
        Assert.Contains("world", Text(patternedExample));

        // A standalone example, not nested under any pattern.
        var arousedExample = Assert.Single(
            firstSense.Examples.OfType<LongmanExample>(),
            example => Text(example) == "The news aroused a lot of curiosity among local people.");

        Assert.Equal(
            [
                ("The news ", false),
                ("aroused", true),
                (" a lot of ", false),
                ("curiosity", true),
                (" among local people.", false),
            ],
            arousedExample.Segments.Select(s => (s.Text, s.IsEmphasized)));
    }

    [Fact]
    public void Parse_ReadFixture_ReturnsDistinctPronunciationForPastTenseInflectionForm()
    {
        var html = LoadFixture("longman-read.html");

        var result = LongmanHtmlParser.Parse("read", html);

        Assert.Null(result.Error);
        var verbEntry = Assert.Single(result.Entries, entry => entry.PartOfSpeech == "verb");

        var baseForm = Assert.Single(verbEntry.Pronunciations);
        Assert.Null(baseForm.Label);
        Assert.Equal("riːd", Assert.Single(baseForm.British).Ipa);

        var pastTense = Assert.Single(
            verbEntry.InflectionForms,
            f => f.Label == "past tense and past participle" && f.Form == "read");
        Assert.NotNull(pastTense.Pronunciation);
        Assert.Equal("red", Assert.Single(pastTense.Pronunciation!.British).Ipa);
        Assert.NotEqual(baseForm.British[0].Ipa, pastTense.Pronunciation.British[0].Ipa);
    }

    [Fact]
    public void Parse_PutFixture_ExtractsMultipleInflectionFormsWithoutPronunciationWhenRegular()
    {
        var html = LoadFixture("longman-put.html");

        var result = LongmanHtmlParser.Parse("put", html);

        Assert.Null(result.Error);
        // Longman's "put" page has more than one verb homograph, sharing identical inflections.
        var verbEntry = result.Entries.First(entry => entry.PartOfSpeech == "verb");

        var pastTenseAndParticiple = Assert.Single(
            verbEntry.InflectionForms,
            f => f.Label == "past tense and past participle" && f.Form == "put");
        var presentParticiple = Assert.Single(
            verbEntry.InflectionForms,
            f => f.Label == "present participle" && f.Form == "putting");

        // "put"/"put" share the base form's pronunciation exactly and "putting" is a regular
        // -ing formation, so Longman doesn't bother giving either of them their own phonetics.
        Assert.Null(pastTenseAndParticiple.Pronunciation);
        Assert.Null(presentParticiple.Pronunciation);
    }

    [Fact]
    public void Parse_WifeFixture_ExtractsPluralWithItsOwnPronunciation()
    {
        var html = LoadFixture("longman-wife.html");

        var result = LongmanHtmlParser.Parse("wife", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var plural = Assert.Single(entry.InflectionForms, f => f.Label == "plural" && f.Form == "wives");
        Assert.NotNull(plural.Pronunciation);
        Assert.Equal("waɪvz", Assert.Single(plural.Pronunciation!.British).Ipa);
    }

    [Fact]
    public void Parse_BreakFixture_FlattensLetteredSubsensesInsteadOfDroppingAllButTheFirst()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var verbEntry = result.Entries.First(e => e.PartOfSpeech == "verb");

        var sense1a = Assert.Single(verbEntry.Senses, s => s.SenseLabel == "1a");
        var sense1b = Assert.Single(verbEntry.Senses, s => s.SenseLabel == "1b");

        // Both lettered sub-senses share their parent's guideword/signpost...
        Assert.Equal("IN PIECES", sense1a.Guideword);
        Assert.Equal("separate into pieces", sense1a.Signpost);
        Assert.Equal(sense1a.Guideword, sense1b.Guideword);
        Assert.Equal(sense1a.Signpost, sense1b.Signpost);

        // ...but each keeps its own distinct definition and examples - "1b" used to be dropped
        // entirely because .DEF/.EXAMPLE were read straight off the shared parent .Sense.
        Assert.Contains("you make it separate into two or more pieces", sense1a.Definition);
        Assert.NotEmpty(sense1a.Examples);
        Assert.Contains("if something breaks, it separates into two or more pieces", sense1b.Definition);
        Assert.NotEmpty(sense1b.Examples);
        Assert.NotEqual(sense1a.Definition, sense1b.Definition);
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsIdiomsAndPhrasalVerbsAsCrossReferencesOnly()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var verbEntry = result.Entries.First(e => e.PartOfSpeech == "verb");

        var breakAway = Assert.Single(verbEntry.Idioms, i => i.Phrase == "break away");
        Assert.Equal("/dictionary/break-away", breakAway.Url);

        // Longman only links to these - it never embeds their definition (LongmanIdiom has no
        // senses at all) or a CEFR level on this page.
        IIdiom idiom = breakAway;
        Assert.Null(idiom.CefrLevel);

        // A cross-referenced phrase must never be mistaken for a literal numbered sense.
        Assert.DoesNotContain(verbEntry.Senses, s => s.Definition == "break away");
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsEtymologyOnlyForTheHomographThatHasOne()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var verbEntry = result.Entries.First(e => e.PartOfSpeech == "verb");
        var nounEntry = result.Entries.First(e => e.PartOfSpeech == "noun");

        Assert.Equal("Old English: brecan", verbEntry.Etymology);
        Assert.Null(nounEntry.Etymology);
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsWordFamilyWithOpposites()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        Assert.Contains(entry.WordFamily, m => m.PartOfSpeech == "noun" && m.Word == "breakage" && !m.IsOpposite);
        Assert.Contains(entry.WordFamily, m => m.PartOfSpeech == "adjective" && m.Word == "breakable" && !m.IsOpposite);
        Assert.Contains(entry.WordFamily, m => m.PartOfSpeech == "adjective" && m.Word == "unbreakable" && m.IsOpposite);
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsCollocationGroupWithMeaningHint()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var verbEntry = result.Entries.First(e => e.PartOfSpeech == "verb");

        var group = Assert.Single(verbEntry.CollocationGroups);
        Assert.Contains("Meaning 5", group.MeaningHint);

        var section = Assert.Single(group.Sections, s => s.Heading == "break + NOUN");
        Assert.Contains(section.Collocations, c => c.Phrase == "break your promise" && c.Gloss is null);
        Assert.Contains(section.Collocations, c => c.Phrase == "break your word" && c.Gloss != null && c.Gloss.Contains("break your promise"));
    }

    [Fact]
    public void Parse_AppointmentFixture_ExtractsEveryCollocationExampleWithGeoAndVariants()
    {
        var html = LoadFixture("longman-appointment.html");

        var result = LongmanHtmlParser.Parse("appointment", html);

        Assert.Null(result.Error);
        var group = Assert.Single(result.Entries[0].CollocationGroups);
        var verbs = Assert.Single(group.Sections, s => s.Heading == "verbs");

        // The British phrase and its American variant each get their own example - both are kept.
        var book = Assert.Single(verbs.Collocations, c => c.Phrase == "book an appointment");
        Assert.Equal("British English", book.Geo);
        var schedule = Assert.Single(book.Variants);
        Assert.Equal("schedule an appointment", schedule.Phrase);
        Assert.Equal("American English", schedule.Geo);
        Assert.Null(schedule.LinkWord);
        Assert.Equal("make an appointment", book.Gloss);
        Assert.Equal(
            ["Have you booked another appointment at the clinic?", "I’ve scheduled your appointment for 9.30."],
            book.Examples);

        var have = Assert.Single(verbs.Collocations, c => c.Phrase == "have an appointment");
        Assert.Null(have.Geo);
        Assert.Empty(have.Variants);
        Assert.Single(have.Examples);

        var nouns = Assert.Single(group.Sections, s => s.Heading == "ADJECTIVES/NOUN + appointment");
        Assert.Equal("British English", Assert.Single(nouns.Collocations, c => c.Phrase == "a hospital appointment").Geo);

        var doctors = Assert.Single(nouns.Collocations, c => c.Phrase == "a doctor’s appointment");
        var atTheDoctors = Assert.Single(doctors.Variants);
        Assert.Equal("an appointment at the doctor’s", atTheDoctors.Phrase);
        Assert.Equal("also", atTheDoctors.LinkWord);
        Assert.Null(atTheDoctors.Geo);
        Assert.Equal(2, doctors.Examples.Count);
    }

    [Fact]
    public void Parse_ShoppingAndReadFixtures_ExtractSenseGeo()
    {
        var shopping = LongmanHtmlParser.Parse("shopping", LoadFixture("longman-shopping.html"));
        Assert.Contains(shopping.Entries.SelectMany(e => e.Senses), s => s.SenseLabel == "3" && s.Geo == "British English");

        var read = LongmanHtmlParser.Parse("read", LoadFixture("longman-read.html"));
        Assert.Contains(read.Entries.SelectMany(e => e.Senses), s => s.SenseLabel == "11" && s.Geo == "British English");
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsSenseVariant()
    {
        var result = LongmanHtmlParser.Parse("break", LoadFixture("longman-break.html"));

        var sense = Assert.Single(
            result.Entries.SelectMany(e => e.Senses),
            s => s.Variants.Any(v => v.Phrase == "commercial break"));
        Assert.Equal("also", sense.Variants[0].LinkWord);
        Assert.Contains("advertisements", sense.Definition);
    }

    [Fact]
    public void Parse_PutFixture_ExtractsThesaurusVariantWithGeo()
    {
        var result = LongmanHtmlParser.Parse("put", LoadFixture("longman-put.html"));

        var stick = result.Entries
            .SelectMany(e => e.ThesaurusSections)
            .SelectMany(s => s.Entries)
            .First(e => e.Word == "stick");
        // put's THESAURUS box is one unheaded section - it must still come through.
        Assert.Contains(result.Entries.SelectMany(e => e.ThesaurusSections), s => s.Heading is null);
        var bung = Assert.Single(stick.Variants);
        Assert.Equal("bung", bung.Phrase);
        Assert.Equal("also", bung.LinkWord);
        Assert.Equal("British English", bung.Geo);
        Assert.Null(stick.Geo);
    }

    [Fact]
    public void Parse_BreakFixture_ExtractsThesaurusSections()
    {
        var html = LoadFixture("longman-break.html");

        var result = LongmanHtmlParser.Parse("break", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var section = Assert.Single(entry.ThesaurusSections, s => s.Heading == "to break something");
        var smash = Assert.Single(section.Entries, e => e.Word == "smash");
        Assert.Equal("verb", smash.PartOfSpeech);
        Assert.Contains("a lot of force", smash.Definition);
        Assert.NotEmpty(smash.Examples);
    }
}
