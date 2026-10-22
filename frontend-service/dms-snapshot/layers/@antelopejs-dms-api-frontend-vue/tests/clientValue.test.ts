import { describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useClientValue } from '../app/composables/useClientValue'

// A value the server and the browser may write differently (a weekday
// written by two ICU versions: "Thursday, 15 October" in Node, "Thursday 15
// October" in a recent Chrome) must not reach the server's HTML, or the
// hydration of every page showing it reports a mismatch.

const Tooltip = (read: () => string) =>
  defineComponent({
    setup() {
      const title = useClientValue(read)
      return () => h('time', { title: title.value }, 'for 3 min')
    },
  })

interface TestNode {
  tag: string
  props: Record<string, unknown>
  children: TestNode[]
  text?: string
}

// A renderer without a DOM: enough to mount a component in Node.
const { createApp } = createRenderer<TestNode, TestNode>({
  createElement: (tag) => ({ tag, props: {}, children: [] }),
  createText: (text) => ({ tag: '#text', props: {}, children: [], text }),
  createComment: (text) => ({ tag: '#comment', props: {}, children: [], text }),
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.children = [{ tag: '#text', props: {}, children: [], text }]
  },
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: (node, key, _previous, next) => {
    node.props[key] = next
  },
})

describe('useClientValue', () => {
  it('leaves the value out of the server render', async () => {
    const read = vi.fn(() => 'Thursday, 15 October 2026 at 19:58')
    const html = await renderToString(createSSRApp(Tooltip(read)))
    expect(html).toBe('<time>for 3 min</time>')
    expect(read).not.toHaveBeenCalled()
  })

  it('gives the value once the browser has mounted the component', async () => {
    const root: TestNode = { tag: 'root', props: {}, children: [] }
    createApp(Tooltip(() => 'Thursday 15 October 2026 at 19:58')).mount(root)
    await nextTick()
    expect(root.children[0]?.props.title).toBe(
      'Thursday 15 October 2026 at 19:58',
    )
  })
})
