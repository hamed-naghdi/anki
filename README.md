# Personal Dictionary & Anki App

A lightweight personal app for vocabulary learning and Anki card generation: look up a word across
multiple dictionaries, pick the meanings/examples you want, and turn them into Anki notes.

## Status

Backend REST API only, in progress. No frontend yet, no AnkiConnect integration yet.

Implemented so far:

- ASP.NET Core 10 Web API with two dictionary providers (**Longman**, **Oxford**), each scraping
  its own site and normalizing the result into a shared model.
- A multi-dictionary lookup endpoint that queries any subset of providers in parallel.
- Interactive API docs (Scalar) reading the app's built-in OpenAPI document.
- xUnit tests for both HTML parsers, run against saved HTML fixtures (no network access in tests).

Not started yet: Angular frontend, AnkiConnect integration, German dictionary providers (Duden,
DWDS), card preview/generation.

## Tech stack

- **Backend**: ASP.NET Core 10 (C#, minimal APIs), [AngleSharp](https://anglesharp.github.io/) for
  HTML parsing, [Scalar](https://github.com/scalar/scalar) for API docs.
- **Frontend**: Angular (planned, not started - `src/frontend/` is currently empty).
- **Testing**: xUnit, with saved HTML fixtures per dictionary/word combination.

## Project structure

```
src/backend/
  Dictionary.slnx
  Dictionary.Api/
    Program.cs                       endpoint definitions + DI wiring
    Models/                          shared, provider-agnostic types
      IDictionaryEntry.cs            } interfaces every provider's entry/sense/example
      ISense.cs                      } implements - kept intentionally minimal so no
      IExample.cs                    } provider is forced to carry another's fields
      Pronunciation.cs, TextSegment.cs, UsageLabel.cs   shared value types
      DictionarySourceResult.cs, DictionarySearchResult.cs   multi-dictionary response shape
      DictionaryLookupResult.cs      single-provider response shape (generic over entry type)
    Providers/
      IDictionaryProvider.cs         one provider's fetch+parse contract (generic over entry type)
      IDictionarySource.cs           non-generic adapter, used by the multi-dictionary endpoint
      HtmlExtractionHelpers.cs       AngleSharp helpers shared by every parser
      DictionaryEntryJsonPolymorphism.cs   lets IDictionaryEntry serialize as its concrete type
      Longman/                       Longman-specific provider, parser, and model types
      Oxford/                        Oxford-specific provider, parser, and model types
    Http/
      PoliteHttpMessageHandler.cs    rotating User-Agent + randomized delay between requests
  Dictionary.Api.Tests/
    Fixtures/                        saved HTML pages, one per dictionary/word combination tested
    Providers/                       LongmanHtmlParserTests.cs, OxfordHtmlParserTests.cs
src/frontend/                        empty - Angular app not started yet
```

### Why per-provider models instead of one shared model

Longman and Oxford structure the same kind of information very differently - CEFR levels vs.
frequency dots, sense-wide grammar patterns vs. patterns tied to one specific example, etc. Rather
than forcing both into one bloated shared type, each provider has its own concrete entry/sense/
example types (`LongmanDictionaryEntry`, `OxfordDictionaryEntry`, ...) that implement the shared
`IDictionaryEntry`/`ISense`/`IExample` interfaces. A provider only carries the fields its own
dictionary actually has.

## API

Run the API, then browse the interactive docs at **`/scalar/v1`** (see [Running locally](#running-locally)).

### `GET /api/dictionaries/longman/{word}`

Look up a word in Longman only. Returns `DictionaryLookupResult<LongmanDictionaryEntry>`.

### `GET /api/dictionaries/oxford/{word}`

Look up a word in Oxford only. Returns `DictionaryLookupResult<OxfordDictionaryEntry>`.

### `GET /api/dictionaries/lookup/{word}?sources=...`

Look up a word across any subset of registered dictionaries at once, in parallel. Returns a
`DictionarySearchResult` - one entry list per source, each entry tagged with a `"provider"` field
("longman"/"oxford") so a mixed list can still be told apart.

`sources` is a repeated query parameter (`?sources=oxford&sources=longman`), not comma-separated.
Omit it, or pass `?sources=all`, to query every registered dictionary.

```
GET /api/dictionaries/lookup/example                          # all dictionaries
GET /api/dictionaries/lookup/example?sources=longman           # one dictionary
GET /api/dictionaries/lookup/example?sources=oxford&sources=longman   # a subset
```

Valid `sources` values today: `longman`, `oxford`. Unknown values are silently ignored. Adding a
third dictionary later only requires registering one new `IDictionarySource` in `Program.cs` - this
endpoint's code doesn't change.

## Running locally

Requires the .NET 10 SDK.

```bash
dotnet run --project src/backend/Dictionary.Api
```

The API listens on `http://localhost:5000` by default (see `Properties/launchSettings.json`).
Open `http://localhost:5000/scalar/v1` for interactive docs, or call the endpoints directly, e.g.:

```bash
curl http://localhost:5000/api/dictionaries/lookup/example
```

## Testing

```bash
dotnet test src/backend/Dictionary.slnx
```

Parser tests run entirely against saved HTML fixtures in `Dictionary.Api.Tests/Fixtures/` - no
network access during the test run itself. Fixtures are fetched once (a plain `curl` against the
live dictionary page) when a new markup shape needs coverage.
