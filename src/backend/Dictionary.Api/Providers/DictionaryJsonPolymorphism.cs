using System.Text.Json.Serialization.Metadata;
using Dictionary.Api.Models;
using Dictionary.Api.Providers.Longman.Models;
using Dictionary.Api.Providers.Oxford.Models;

namespace Dictionary.Api.Providers;

/// <summary>
/// Registers which concrete types exist behind the shared model's interfaces, so anything
/// serialized through an interface-typed property emits its full provider-specific shape instead
/// of just the interface's own members:
/// <list type="bullet">
/// <item><see cref="IDictionaryEntry"/> - the multi-dictionary lookup endpoint returns
/// <c>IReadOnlyList&lt;IDictionaryEntry&gt;</c> since it mixes providers in one response; tagged
/// by "provider".</item>
/// <item><see cref="IExample"/> - a sense's examples mix plain sentences with provider-specific
/// example groups; tagged by "sourceType". Lists typed to a concrete example type (e.g. the
/// sentences inside a Longman group) carry no tag, since they can only ever hold that type.</item>
/// </list>
///
/// This lives here (in Providers, the composition-root layer that already wires up concrete
/// providers) rather than as attributes on the interfaces themselves, so the shared model in
/// Models/ never has to reference a specific provider's type - only Program.cs's wiring does.
/// </summary>
internal static class DictionaryJsonPolymorphism
{
    public static void Apply(JsonTypeInfo typeInfo)
    {
        if (typeInfo.Type == typeof(IDictionaryEntry))
        {
            typeInfo.PolymorphismOptions = new JsonPolymorphismOptions
            {
                TypeDiscriminatorPropertyName = "provider",
                DerivedTypes =
                {
                    new JsonDerivedType(typeof(LongmanDictionaryEntry), Longman.LongmanDictionarySource.SourceKey),
                    new JsonDerivedType(typeof(OxfordDictionaryEntry), Oxford.OxfordDictionarySource.SourceKey),
                },
            };
        }
        else if (typeInfo.Type == typeof(IExample))
        {
            typeInfo.PolymorphismOptions = new JsonPolymorphismOptions
            {
                TypeDiscriminatorPropertyName = "sourceType",
                DerivedTypes =
                {
                    new JsonDerivedType(typeof(LongmanExample), nameof(LongmanExample)),
                    new JsonDerivedType(typeof(LongmanCollectionExample), nameof(LongmanCollectionExample)),
                    new JsonDerivedType(typeof(LongmanGrammarExample), nameof(LongmanGrammarExample)),
                    new JsonDerivedType(typeof(OxfordExample), nameof(OxfordExample)),
                },
            };
        }
    }
}
