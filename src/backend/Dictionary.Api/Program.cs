using Dictionary.Api.Http;
using Dictionary.Api.Providers;
using Dictionary.Api.Providers.Longman;
using Dictionary.Api.Providers.Longman.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services.AddTransient<PoliteHttpMessageHandler>();
builder.Services
    .AddHttpClient<LongmanDictionaryProvider>(client =>
    {
        client.BaseAddress = new Uri("https://www.ldoceonline.com/");
        client.Timeout = TimeSpan.FromSeconds(15);
    })
    .AddHttpMessageHandler<PoliteHttpMessageHandler>();

builder.Services.AddScoped<IDictionaryProvider<LongmanDictionaryEntry>>(sp => sp.GetRequiredService<LongmanDictionaryProvider>());

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.MapGet("/api/dictionaries/longman/{word}", async (string word, IDictionaryProvider<LongmanDictionaryEntry> provider, CancellationToken cancellationToken) =>
    {
        var result = await provider.LookupAsync(word, cancellationToken);
        return Results.Ok(result);
    })
    .WithName("LookupLongmanWord");

app.Run();
