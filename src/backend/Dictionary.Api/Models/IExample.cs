namespace Dictionary.Api.Models;

/// <summary>
/// Marker for anything a sense lists as an example - a plain sentence, or a provider-specific
/// group of sentences (e.g. Longman's collocation/grammar-pattern groups). Shapes differ too much
/// per source to share members; JSON tells them apart by a "sourceType" discriminator instead (see
/// <c>Providers.DictionaryJsonPolymorphism</c>).
/// </summary>
public interface IExample;
