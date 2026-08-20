using System.Text.Json.Serialization.Metadata;
using Dictionary.Api.Anki;
using Dictionary.Api.Http;
using Dictionary.Api.Models;
using Dictionary.Api.Providers;
using Dictionary.Api.Providers.Longman;
using Dictionary.Api.Providers.Longman.Models;
using Dictionary.Api.Providers.Oxford;
using Dictionary.Api.Providers.Oxford.Models;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;

const string FrontendCorsPolicy = "FrontendDev";

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolver = new DefaultJsonTypeInfoResolver
    {
        Modifiers = { DictionaryEntryJsonPolymorphism.Apply },
    };
});

builder.Services.AddTransient<PoliteHttpMessageHandler>();
builder.Services
    .AddHttpClient<LongmanDictionaryProvider>(client =>
    {
        client.BaseAddress = new Uri("https://www.ldoceonline.com/");
        client.Timeout = TimeSpan.FromSeconds(15);
    })
    .AddHttpMessageHandler<PoliteHttpMessageHandler>();

builder.Services
    .AddHttpClient<OxfordDictionaryProvider>(client =>
    {
        client.BaseAddress = new Uri("https://www.oxfordlearnersdictionaries.com/");
        client.Timeout = TimeSpan.FromSeconds(15);
    })
    .AddHttpMessageHandler<PoliteHttpMessageHandler>();

builder.Services.AddScoped<IDictionaryProvider<LongmanDictionaryEntry>>(sp => sp.GetRequiredService<LongmanDictionaryProvider>());
builder.Services.AddScoped<IDictionaryProvider<OxfordDictionaryEntry>>(sp => sp.GetRequiredService<OxfordDictionaryProvider>());

// Every dictionary source needs exactly one line here to take part in the multi-dictionary
// lookup endpoint below - IEnumerable<IDictionarySource> picks up every registration.
builder.Services.AddScoped<IDictionarySource, LongmanDictionarySource>();
builder.Services.AddScoped<IDictionarySource, OxfordDictionarySource>();

builder.Services
    .AddOptions<AnkiConnectOptions>()
    .Bind(builder.Configuration.GetSection(AnkiConnectOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddHttpClient<AnkiConnectClient>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<AnkiConnectOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseCors(FrontendCorsPolicy);

app.MapGet("/api/anki/decks", async (AnkiConnectClient ankiConnect, CancellationToken cancellationToken) =>
    {
        var result = await ankiConnect.GetDeckNamesAsync(cancellationToken);
        return Results.Ok(result);
    })
    .WithName("GetAnkiDecks");

app.MapGet("/api/anki/note-types", async (AnkiConnectClient ankiConnect, CancellationToken cancellationToken) =>
    {
        var result = await ankiConnect.GetNoteTypeNamesAsync(cancellationToken);
        return Results.Ok(result);
    })
    .WithName("GetAnkiNoteTypes");

app.MapGet("/api/dictionaries/longman/{word}", async (string word, IDictionaryProvider<LongmanDictionaryEntry> provider, CancellationToken cancellationToken) =>
    {
        var result = await provider.LookupAsync(word, cancellationToken);
        return Results.Ok(result);
    })
    .WithName("LookupLongmanWord");

app.MapGet("/api/dictionaries/oxford/{word}", async (string word, IDictionaryProvider<OxfordDictionaryEntry> provider, CancellationToken cancellationToken) =>
    {
        var result = await provider.LookupAsync(word, cancellationToken);
        return Results.Ok(result);
    })
    .WithName("LookupOxfordWord");

app.MapGet("/api/dictionaries/lookup/{word}", async (
        string word,
        string[]? sources,
        IEnumerable<IDictionarySource> allSources,
        CancellationToken cancellationToken) =>
    {
        var requestedKeys = ParseRequestedSourceKeys(sources);
        var selectedSources = requestedKeys is null
            ? allSources
            : allSources.Where(source => requestedKeys.Contains(source.Key));

        var results = await Task.WhenAll(selectedSources.Select(source => source.LookupAsync(word, cancellationToken)));

        return Results.Ok(new DictionarySearchResult { Word = word, Results = results.ToList() });
    })
    .WithName("LookupWordAcrossDictionaries");

app.Run();

// null (no ?sources= at all) = no filter, query every registered source. "all" is accepted as an
// explicit alias for the same thing. Repeat the query param per source, e.g.
// ?sources=oxford&sources=longman.
static HashSet<string>? ParseRequestedSourceKeys(string[]? sources)
{
    if (sources is null || sources.Length == 0)
    {
        return null;
    }

    var keys = sources
        .Where(s => !string.IsNullOrWhiteSpace(s))
        .Select(s => s.Trim())
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    return keys.Contains("all") ? null : keys;
}
