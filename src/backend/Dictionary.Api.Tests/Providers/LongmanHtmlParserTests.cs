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
        Assert.False(string.IsNullOrWhiteSpace(pronunciation.British));
        Assert.False(string.IsNullOrWhiteSpace(pronunciation.American));
        Assert.NotNull(pronunciation.BritishAudioUrl);
        Assert.NotNull(pronunciation.AmericanAudioUrl);

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
    public void Parse_BigFixture_ExtractsWordForms()
    {
        var html = LoadFixture("longman-big.html");

        var result = LongmanHtmlParser.Parse("big", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        Assert.NotNull(entry.WordForms);
        Assert.Contains("bigger", entry.WordForms);
        Assert.Contains("biggest", entry.WordForms);
        Assert.DoesNotContain("<strong>", entry.WordForms);
    }

    [Fact]
    public void Parse_CuriosityFixture_EmphasizesCollocatesAndAttachesPatternToItsOwnExample()
    {
        var html = LoadFixture("longman-curiosity.html");

        var result = LongmanHtmlParser.Parse("curiosity", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var pronunciation = Assert.Single(entry.Pronunciations);
        Assert.NotEqual(pronunciation.British, pronunciation.American);

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
    public void Parse_ReadFixture_ReturnsDistinctPronunciationForPastTense()
    {
        var html = LoadFixture("longman-read.html");

        var result = LongmanHtmlParser.Parse("read", html);

        Assert.Null(result.Error);
        var verbEntry = Assert.Single(result.Entries, entry => entry.PartOfSpeech == "verb");

        Assert.Equal(2, verbEntry.Pronunciations.Count);

        var baseForm = verbEntry.Pronunciations[0];
        Assert.Null(baseForm.Label);
        Assert.Equal("riːd", baseForm.British);

        var pastTense = verbEntry.Pronunciations[1];
        Assert.Equal("past tense and past participle", pastTense.Label);
        Assert.Equal("red", pastTense.British);
        Assert.NotEqual(baseForm.British, pastTense.British);
    }
}
