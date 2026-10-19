using System.Net;
using Dictionary.Api.Providers.Oxford;

namespace Dictionary.Api.Tests.Providers;

public class OxfordDictionaryProviderTests
{
    private const string BaseUrl = "https://www.oxfordlearnersdictionaries.com/";

    private static string LoadFixture(string fileName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName));

    /// <summary>Serves saved fixtures by URL instead of hitting the network; any other URL is a 404.</summary>
    private sealed class FixtureHandler(IReadOnlyDictionary<string, string> fixturesByPath) : HttpMessageHandler
    {
        public List<string> RequestedPaths { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery;
            RequestedPaths.Add(path);

            var response = fixturesByPath.TryGetValue(path, out var fixture)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(LoadFixture(fixture)) }
                : new HttpResponseMessage(HttpStatusCode.NotFound);
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task LookupAsync_Tear_FollowsNearbyListsToEveryHomographInNumberOrder()
    {
        var handler = new FixtureHandler(new Dictionary<string, string>
        {
            ["/search/english/direct/?q=tear"] = "oxford-tear.html",
            ["/definition/english/tear1_2"] = "oxford-tear1-noun.html",
            ["/definition/english/tear2_1"] = "oxford-tear2-verb.html",
            ["/definition/english/tear2_2"] = "oxford-tear2-noun.html",
        });
        var provider = new OxfordDictionaryProvider(new HttpClient(handler) { BaseAddress = new Uri(BaseUrl) });

        var result = await provider.LookupAsync("tear");

        Assert.Null(result.Error);
        Assert.Equal(
            [("1", "verb"), ("1", "noun"), ("2", "verb"), ("2", "noun")],
            result.Entries.Select(e => (e.HomographNumber, e.PartOfSpeech)));
        Assert.All(result.Entries, e => Assert.Equal("tear", e.Headword));
        // tear² noun is the one that was missing before - "a drop of liquid that comes out of your eye".
        Assert.Contains(result.Entries[3].Senses, s => s.Definition is not null && s.Definition.Contains("eye"));
        // Oxford's tear² verb page really has no senses of its own, only a phrasal verb ("tear up").
        Assert.Empty(result.Entries[2].Senses);

        // Every page fetched exactly once - tear1_1 is linked back to from the others but already loaded.
        Assert.Equal(handler.RequestedPaths.Distinct().Count(), handler.RequestedPaths.Count);
        Assert.DoesNotContain("/definition/english/tear1_1", handler.RequestedPaths);
    }
}
