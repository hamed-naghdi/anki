using System.ComponentModel.DataAnnotations;

namespace Dictionary.Api.Anki;

public sealed class AnkiConnectOptions
{
    public const string SectionName = "AnkiConnect";

    [Required]
    [Url]
    public required string BaseUrl { get; init; }
}
