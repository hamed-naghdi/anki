namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>
/// One entry in Longman's "Word family" box, e.g. "break" the verb has family members "breakage"
/// (noun) and "breakable" (adjective, itself opposed by "unbreakable"). This box is shared page
/// furniture above all of a page's homographs, not specific to one part-of-speech entry - the same
/// list is attached to every <see cref="LongmanDictionaryEntry"/> parsed from that page.
/// </summary>
public sealed class WordFamilyMember
{
    public required string PartOfSpeech { get; init; }
    public required string Word { get; init; }

    /// <summary>True when this word was listed as the opposite of the previous member, e.g. "unbreakable" opposing "breakable".</summary>
    public bool IsOpposite { get; init; }
}
