using System.Net;
using Dictionary.Api.Providers.Longman;

namespace Dictionary.Api.Tests.Providers;

public class LongmanDictionaryProviderTests
{
    private const string BaseUrl = "https://www.ldoceonline.com/";

    private static string LoadFixture(string fileName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName));

    /// <summary>Serves saved fixtures by URL instead of hitting the network; any other URL is a 404.</summary>
    private sealed class FixtureHandler(IReadOnlyDictionary<string, string> fixturesByPath) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = fixturesByPath.TryGetValue(request.RequestUri!.PathAndQuery, out var fixture)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(LoadFixture(fixture)) }
                : new HttpResponseMessage(HttpStatusCode.NotFound);
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task LookupAsync_PhraseFiledUnderLongerHeadword_GoesThroughSearchRedirect()
    {
        // "here you are" has no page of its own - Longman files it under "here you are/here you go",
        // so only the search redirect (not a guessed /dictionary/here-you-are slug) finds it.
        var handler = new FixtureHandler(new Dictionary<string, string>
        {
            ["/search/english/direct/?q=here%20you%20are"] = "longman-here-you-are.html",
        });
        var provider = new LongmanDictionaryProvider(new HttpClient(handler) { BaseAddress = new Uri(BaseUrl) });

        var result = await provider.LookupAsync(" here you are ");

        Assert.Null(result.Error);
        Assert.NotEmpty(result.Entries);
        Assert.Contains("here you are", result.Entries[0].Headword);
    }
}
