namespace Dictionary.Api.Models;

/// <summary>
/// One accepted pronunciation within a single accent, e.g. "controversy" has two separately
/// recorded British pronunciations (/ˈkɒntrəvɜːsi/ and /kənˈtrɒvəsi/). <see cref="AudioUrl"/> is
/// null when this specific variant has no dedicated recording - Longman lists multiple written
/// variants (e.g. "often" /ˈɒfən, ˈɒftən/) but only ever records one audio file per accent.
/// </summary>
public sealed class PhoneticVariant
{
    public required string Ipa { get; init; }
    public string? AudioUrl { get; init; }
}
