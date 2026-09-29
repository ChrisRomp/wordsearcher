/** Browser APIs that jsdom doesn't implement, stubbed for UI tests. Import before rendering. */

class FakeFontFace {
  family: string
  constructor(family: string) {
    this.family = family
  }
  load() {
    return Promise.resolve(this)
  }
}

if (!('FontFace' in globalThis)) Object.assign(globalThis, { FontFace: FakeFontFace })
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, ready: Promise.resolve() } })
}

// Text measurement: about 0.55em per character, using the px size from ctx.font.
HTMLCanvasElement.prototype.getContext = function () {
  return {
    font: '10px sans-serif',
    measureText(text: string) {
      return { width: text.length * (Number.parseFloat(this.font) || 10) * 0.55 }
    },
  }
} as unknown as HTMLCanvasElement['getContext']

const dialog = HTMLDialogElement.prototype
if (typeof dialog.showModal !== 'function') {
  dialog.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dialog.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
