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

        var example = Assert.Single(firstSense.Examples);
        Assert.Equal("Can anyone give me an example of a transitive verb?", Text(example));
        Assert.Equal("example of", example.Pattern);
        Assert.Null(example.Note);
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

        var collocationExample = Assert.Single(
            allExamples,
            example => example.Note is not null && example.Note.StartsWith("Collocation: shopping expedition/trip"));
        Assert.Contains("gone on", Text(collocationExample));
        Assert.Contains("shopping trip", Text(collocationExample));
        Assert.Null(collocationExample.Pattern);

        Assert.Contains(
            allExamples,
            example => example.Note is not null && example.Note.Contains("went shopping and bought a lot of things"));
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
        var patternedExample = Assert.Single(firstSense.Examples, example => example.Pattern is not null);
        Assert.Equal("curiosity about", patternedExample.Pattern);
        Assert.Contains("natural", Text(patternedExample));
        Assert.Contains("world", Text(patternedExample));

        var arousedExample = Assert.Single(
            firstSense.Examples,
            example => Text(example) == "The news aroused a lot of curiosity among local people.");
        Assert.Null(arousedExample.Pattern);

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

        // Longman only links to these - it never embeds their definition on this page.
        IIdiom idiom = breakAway;
        Assert.Empty(idiom.Senses);
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
