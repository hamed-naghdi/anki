import { Component, computed, inject, input } from '@angular/core';
import { GripVertical } from '@primeicons/angular/grip-vertical';
import { Plus } from '@primeicons/angular/plus';
import { Times } from '@primeicons/angular/times';
import type { TreeNode } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { Tree } from 'primeng/tree';
import type { TreeNodeDropEvent } from 'primeng/types/tree';
import {
  fieldText,
  sourcePath,
  type CardField,
  type LayoutGroup,
  type RichTextField,
} from '../../../card/card-field';
import { CardHtml } from '../../../card/card-html';
import { renderCardSide } from '../../../card/render-card';
import { fromTreeNodes, groupLabel, isValidDrop, toTreeNodes } from '../card-layout';
import { CardEditorStore, type CardSide } from '../card-editor.store';

/**
 * One side's card: a live preview (the exact HTML Anki will store) and the drag-and-drop list its
 * groups and fields are arranged in.
 */
@Component({
  selector: 'app-layout-panel',
  imports: [Tree, ButtonDirective, Textarea, CardHtml, GripVertical, Plus, Times],
  templateUrl: './layout-panel.html',
  host: {
    class:
      'flex flex-col gap-4 border-t border-surface-200 p-4 xl:w-2/5 xl:border-t-0 xl:border-l dark:border-surface-700',
  },
})
export class LayoutPanel {
  readonly side = input.required<CardSide>();

  protected readonly store = inject(CardEditorStore);
  protected readonly state = computed(() => this.store.sides[this.side()]);

  protected readonly preview = computed(() => renderCardSide(this.state().layout()));

  /**
   * The layout as p-tree nodes - a throwaway view rebuilt from the layout on every change. A drop
   * is the one place p-tree rearranges these nodes itself (see onDrop).
   */
  protected readonly nodes = computed(() =>
    toTreeNodes(this.state().layout(), this.state().expandedGroups()),
  );

  protected groupLabel(group: LayoutGroup): string {
    return groupLabel(group, this.state().layout().indexOf(group));
  }

  protected fieldLabel(field: CardField): string {
    return field.kind === 'richText' ? 'Custom text' : sourcePath(field);
  }

  protected readonly fieldText = fieldText;
  protected readonly grip = 'size-3.5 shrink-0 cursor-grab text-(--p-text-muted-color)';
  protected readonly iconButton =
    'shrink-0 rounded p-1 text-(--p-text-muted-color) hover:bg-black/10 dark:hover:bg-white/20';

  // With [validateDrop], p-tree only rearranges its nodes once `accept()` is called - so vet the
  // drop against the layout's rules first, let p-tree apply it (it alone knows whether a "between"
  // drop landed before or after its target), then read the new arrangement back.
  protected onDrop({ dragNode, dropNode, dropPoint, accept }: TreeNodeDropEvent): void {
    if (!dragNode?.key || !dropNode?.key || !dropPoint || !accept) {
      return;
    }
    const drop = { dragKey: dragNode.key, targetKey: dropNode.key, point: dropPoint };
    if (isValidDrop(this.state().layout(), drop)) {
      accept();
      this.state().layout.set(fromTreeNodes(this.nodes()));
    }
  }

  protected setExpanded(node: TreeNode | undefined, expanded: boolean): void {
    const key = node?.key;
    if (key) {
      this.state().expandedGroups.update((keys) => {
        const next = new Set(keys);
        if (expanded) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  protected editRichText(field: RichTextField, event: Event): void {
    field.html.set((event.target as HTMLTextAreaElement).value);
  }
}
