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
        var british = Assert.Single(pronunciation.British);
        var american = Assert.Single(pronunciation.American);
        Assert.Contains("kjʊəriˈɒsəti", british.Ipa);
        Assert.Contains("kjʊriˈɑːsəti", american.Ipa);
        Assert.NotNull(british.AudioUrl);
        Assert.NotNull(american.AudioUrl);

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
    public void Parse_BigFixture_ExtractsInflectionFormsWithoutPronunciationWhenRegular()
    {
        var html = LoadFixture("oxford-big.html");

        var result = OxfordHtmlParser.Parse("big", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var comparative = Assert.Single(entry.InflectionForms, f => f.Label == "comparative" && f.Form == "bigger");
        var superlative = Assert.Single(entry.InflectionForms, f => f.Label == "superlative" && f.Form == "biggest");

        // Regular "-er"/"-est" pronunciation is predictable from spelling, so Oxford doesn't
        // bother recording it separately here (unlike the irregular "good" -> better/best case).
        Assert.Null(comparative.Pronunciation);
        Assert.Null(superlative.Pronunciation);
    }

    [Fact]
    public void Parse_WifeFixture_ExtractsPluralWithItsOwnPronunciationAndAudio()
    {
        var html = LoadFixture("oxford-wife.html");

        var result = OxfordHtmlParser.Parse("wife", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var plural = Assert.Single(entry.InflectionForms, f => f.Label == "plural" && f.Form == "wives");
        Assert.NotNull(plural.Pronunciation);
        var british = Assert.Single(plural.Pronunciation!.British);
        Assert.Equal("/waɪvz/", british.Ipa);
        Assert.NotNull(british.AudioUrl);
    }

    [Fact]
    public void Parse_PutFixture_ExtractsVerbFormsTableWithPerRowAudio()
    {
        var html = LoadFixture("oxford-put.html");

        var result = OxfordHtmlParser.Parse("put", html);

        Assert.Null(result.Error);
        var verbEntry = Assert.Single(result.Entries, e => e.PartOfSpeech == "verb");

        var thirdPerson = Assert.Single(verbEntry.InflectionForms, f => f.Label == "3rd person singular present");
        Assert.Equal("puts", thirdPerson.Form);
        Assert.NotNull(thirdPerson.Pronunciation);
        Assert.NotNull(Assert.Single(thirdPerson.Pronunciation!.British).AudioUrl);

        var presentParticiple = Assert.Single(verbEntry.InflectionForms, f => f.Label == "-ing form");
        Assert.Equal("putting", presentParticiple.Form);

        // "root" (bare infinitive - same as the headword) is deliberately not modeled as its own
        // inflection form, and neither are the auxiliary-only neg/short/strong-form rows.
        Assert.DoesNotContain(verbEntry.InflectionForms, f => f.Form == "put" && f.Label is null);
        Assert.Equal(4, verbEntry.InflectionForms.Count);
    }

    [Fact]
    public void Parse_ControversyFixture_ExtractsTwoDistinctBritishPronunciations()
    {
        var html = LoadFixture("oxford-controversy.html");

        var result = OxfordHtmlParser.Parse("controversy", html);

        Assert.Null(result.Error);
        var entry = result.Entries[0];

        var pronunciation = Assert.Single(entry.Pronunciations);
        Assert.Equal(2, pronunciation.British.Count);
        Assert.Equal("/ˈkɒntrəvɜːsi/", pronunciation.British[0].Ipa);
        Assert.Equal("/kənˈtrɒvəsi/", pronunciation.British[1].Ipa);
        Assert.NotNull(pronunciation.British[0].AudioUrl);
        Assert.NotNull(pronunciation.British[1].AudioUrl);
        Assert.NotEqual(pronunciation.British[0].AudioUrl, pronunciation.British[1].AudioUrl);

        Assert.Single(pronunciation.American);
    }
}
