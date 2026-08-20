using Dictionary.Api.Providers.Oxford;
using Dictionary.Api.Providers.Oxford.Models;

namespace Dictionary.Api.Tests.Providers;

public class OxfordHtmlParserTests
{
    private static string LoadFixture(string fileName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName));

    private static string Text(OxfordExample example) =>
        string.Concat(example.Segments.Select(s => s.Text));

    [Fact]
    public void Parse_CuriosityFixture_ReturnsKeywordSenseWithSenseWidePatterns()
    {
        var html = LoadFixture("oxford-curiosity.html");

        var result = OxfordHtmlParser.Parse("curiosity", html);

        Assert.Equal("curiosity", result.Word);
        Assert.Equal("Oxford", result.Source);
        Assert.Null(result.Error);
        Assert.NotEmpty(result.Entries);

        var entry = result.Entries[0];
        Assert.Equal("noun", entry.PartOfSpeech);
        Assert.True(entry.IsKeyword);
        Assert.Equal("c1", entry.KeywordLevel);

        var pronunciation = Assert.Single(entry.Pronunciations);
        Assert.Contains("kjʊəriˈɒsəti", pronunciation.British);
        Assert.Contains("kjʊriˈɑːsəti", pronunciation.American);
        Assert.NotNull(pronunciation.BritishAudioUrl);
        Assert.NotNull(pronunciation.AmericanAudioUrl);

        var firstSense = entry.Senses[0];
        Assert.Equal("c1", firstSense.CefrLevel);
        Assert.True(firstSense.IsKeyword);
        Assert.Contains("curiosity (about something)", firstSense.Patterns);
        Assert.Contains("curiosity (to do something)", firstSense.Patterns);
        Assert.Contains("desire to know", firstSense.Definition);

        // These patterns describe the whole sense, not one specific example.
        Assert.All(firstSense.Examples, example => Assert.Null(example.Pattern));
    }

    [Fact]
    public void Parse_UnknownWord_ReturnsError()
    {
        var result = OxfordHtmlParser.Parse("zzzzznotaword", "<html><body>not found</body></html>");

        Assert.Empty(result.Entries);
        Assert.Equal("No entries found for 'zzzzznotaword'", result.Error);
    }

    [Fact]
    public void Parse_TrueFixture_AttachesPatternToItsOwnExampleAndExposesOpalBadge()
    {
        var html = LoadFixture("oxford-true.html");

        var result = OxfordHtmlParser.Parse("true", html);

        Assert.Null(result.Error);
        var entry = Assert.Single(result.Entries, e => e.PartOfSpeech == "adjective");

        Assert.True(entry.IsKeyword);
        Assert.Equal("a1", entry.KeywordLevel);
        Assert.Contains(entry.AcademicWordLists, label => label.Code == "OPAL S");

        var allExamples = entry.Senses.SelectMany(s => s.Examples).ToList();

        var patternedExample = Assert.Single(allExamples, e => e.Pattern == "be true (that)…");
        Assert.Equal("Is it true she's leaving?", Text(patternedExample));

        var boldExample = Assert.Single(allExamples, e => Text(e) == "Indicate whether the following statements are true or false.");
        Assert.Contains(boldExample.Segments, s => s.Text == "true or false" && s.IsEmphasized);

        var glossedExample = Assert.Single(allExamples, e => e.Note is not null && e.Note.Contains("completely"));
        Assert.Contains("strictly", Text(glossedExample));
    }

    [Fact]
    public void Parse_GuyFixture_ExtractsInformalRegister()
    {
        var html = LoadFixture("oxford-guy.html");

        var result = OxfordHtmlParser.Parse("guy", html);

        Assert.Null(result.Error);
        var firstSense = result.Entries[0].Senses[0];

        Assert.Equal("informal", firstSense.Register);
        Assert.Equal("a2", firstSense.CefrLevel);
        Assert.Contains(firstSense.Examples, e => e.Segments.Any(s => s.IsEmphasized && s.Text == "big/little guy"));
    }

    [Fact]
    public void Parse_BigFixture_ExtractsWordForms()
    {
        var html = LoadFixture("oxford-big.html");

        var result = OxfordHtmlParser.Parse("big", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        Assert.NotNull(entry.WordForms);
        Assert.Contains("bigger", entry.WordForms);
        Assert.Contains("biggest", entry.WordForms);
    }
}
