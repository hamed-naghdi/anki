using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Dictionary.Api.Models;

namespace Dictionary.Api.Providers;

/// <summary>
/// Registers which concrete entry types exist for <see cref="IDictionaryEntry"/>, so the
/// multi-dictionary lookup endpoint - which serializes results as
/// <c>IReadOnlyList&lt;IDictionaryEntry&gt;</c> since it mixes providers in one response - emits
/// each entry's full provider-specific shape instead of just the interface's shared members.
///
/// This lives here (in Providers, the composition-root layer that already wires up concrete
/// providers) rather than as an attribute on IDictionaryEntry itself, so the shared model in
/// Models/ never has to reference a specific provider's type - only Program.cs's wiring does.
/// Single-provider endpoints (/longman/{word}, /oxford/{word}) are unaffected: they serialize
/// concrete List&lt;LongmanDictionaryEntry&gt;/List&lt;OxfordDictionaryEntry&gt; directly and never
/// go through this interface-typed path.
/// </summary>
internal static class DictionaryEntryJsonPolymorphism
{
    public static void Apply(JsonTypeInfo typeInfo)
    {
        if (typeInfo.Type != typeof(IDictionaryEntry))
        {
            return;
        }

        typeInfo.PolymorphismOptions = new JsonPolymorphismOptions
        {
            TypeDiscriminatorPropertyName = "provider",
            DerivedTypes =
            {
                new JsonDerivedType(typeof(Longman.Models.LongmanDictionaryEntry), Longman.LongmanDictionarySource.SourceKey),
                new JsonDerivedType(typeof(Oxford.Models.OxfordDictionaryEntry), Oxford.OxfordDictionarySource.SourceKey),
            },
        };
    }
}
