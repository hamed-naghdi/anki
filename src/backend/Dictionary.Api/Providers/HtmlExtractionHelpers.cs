using AngleSharp.Dom;
using Dictionary.Api.Models;

namespace Dictionary.Api.Providers;

/// <summary>Small AngleSharp-DOM helpers shared by every dictionary provider's HTML parser.</summary>
internal static class HtmlExtractionHelpers
{
    public static string? ExtractText(IElement? scope, string selector)
    {
        var text = scope?.QuerySelector(selector)?.TextContent?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    public static string ExtractTextExcluding(IElement element, string excludeSelector)
    {
        var clone = (IElement)element.Clone(deep: true);
        foreach (var excluded in clone.QuerySelectorAll(excludeSelector).ToList())
        {
            excluded.Remove();
        }

        return clone.TextContent.Trim();
    }

    /// <summary>
    /// Splits an element's text into runs, marking text inside any element whose class is
    /// <paramref name="emphasisClass"/> as emphasized (e.g. Longman's .COLLOINEXA, Oxford's .cl
    /// bolded collocates), instead of flattening everything to plain text. Elements matching
    /// <paramref name="excludeSelectors"/> (glossary asides, audio icons, ...) are dropped first.
    /// </summary>
    public static List<TextSegment> ExtractTextSegments(IElement element, string emphasisClass, params string[] excludeSelectors)
    {
        var clone = (IElement)element.Clone(deep: true);
        foreach (var selector in excludeSelectors)
        {
            foreach (var excluded in clone.QuerySelectorAll(selector).ToList())
            {
                excluded.Remove();
            }
        }

        var segments = new List<TextSegment>();
        AppendSegments(clone, emphasized: false, emphasisClass, segments);

        if (segments.Count == 0)
        {
            return segments;
        }

        segments[0] = new TextSegment { Text = segments[0].Text.TrimStart(), IsEmphasized = segments[0].IsEmphasized };
        var lastIndex = segments.Count - 1;
        segments[lastIndex] = new TextSegment { Text = segments[lastIndex].Text.TrimEnd(), IsEmphasized = segments[lastIndex].IsEmphasized };

        return segments.Where(s => s.Text.Length > 0).ToList();
    }

    private static void AppendSegments(INode node, bool emphasized, string emphasisClass, List<TextSegment> segments)
    {
        foreach (var child in node.ChildNodes)
        {
            if (child is IText textNode)
            {
                if (!string.IsNullOrEmpty(textNode.Data))
                {
                    segments.Add(new TextSegment { Text = textNode.Data, IsEmphasized = emphasized });
                }
            }
            else if (child is IElement childElement)
            {
                var childEmphasized = emphasized || childElement.ClassList.Contains(emphasisClass);
                AppendSegments(childElement, childEmphasized, emphasisClass, segments);
            }
        }
    }

    public static string StripQueryString(string url)
    {
        var queryIndex = url.IndexOf('?');
        return queryIndex >= 0 ? url[..queryIndex] : url;
    }

    public static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
