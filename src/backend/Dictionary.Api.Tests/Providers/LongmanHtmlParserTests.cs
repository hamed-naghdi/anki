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
}
