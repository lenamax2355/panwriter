import { Doc } from '../appState/AppState'
import { getCss } from './templates/getCss'

const appPath = 'TODO' // TODO

let singleFrame: HTMLIFrameElement | undefined
  , singleFrameLinkEl: HTMLLinkElement | undefined
  , frame1: HTMLIFrameElement | undefined
  , frame2: HTMLIFrameElement | undefined
  ;

/*
const injectBaseTag = (contentWindow: Window, filePath?: string) => {
  // so relative image URLs etc. are found
  const cwd = path.dirname(filePath)
      , base = document.createElement('base')
      ;
  base.setAttribute("href", "file://" + cwd + path.sep);
  contentWindow.document.head.append(base);
}

const injectMathLib = (contentWindow: Window) => {
  [ appPath + '/node_modules/katex/dist/katex.min.css'
  , appPath + '/node_modules/markdown-it-texmath/css/texmath.css'
  ].forEach(href => {
    contentWindow.document.head.appendChild( createLinkEl(href) )
  })
}
*/

const interceptClicks = (contentWindow: Window, e: MouseEvent) => {
  e.preventDefault()
  e.returnValue = false
  if (e.target && ('href' in e.target)) {
    const target = e.target as HTMLAnchorElement
    const { href, hash } = target
    const hrefStart = href.substr(0, 7)
    if (hrefStart === "file://" && hash) {
      // TODO: this seems to currently not work since it's http://localhost:3000 at least in dev
      // probably in-document navigation by hash
      const element = contentWindow.document.querySelector(hash)
      if (element) {
        element.scrollIntoView()
      }
    } else if(hrefStart === "http://" || hrefStart === "https:/") {
      // external link
      window.ipcApi?.send.openLink(href)
    }
  }
  return false
}

async function insertFrame(
  src: string
, target: HTMLElement
, filePath?: string
, sandbox?: string
): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  if (sandbox !== undefined) {
    frame.setAttribute('sandbox', sandbox)
  }
  frame.setAttribute('src', src)
  frame.setAttribute('style', 'width: 100%; height: 100%;')
  target.appendChild(frame)
  return new Promise(resolve => {
    const contentWindow = frame.contentWindow
    contentWindow?.addEventListener('DOMContentLoaded', () => {
      /* TODO: uncomment
      if (filePath) {
        injectBaseTag(contentWindow, filePath)
      }
      injectMathLib(contentWindow)
      */
      contentWindow.addEventListener('click', e => interceptClicks(contentWindow, e))
      return resolve(frame);
    })
  })
}

async function setupSingleFrame(target: HTMLElement, filePath?: string) {
  if (!singleFrame) {
    singleFrame = await insertFrame('previewFrame.html', target, filePath)
  }
  if (frame1) {
    frame1.remove();
    frame1 = undefined
  }
  if (frame2) {
    frame2.remove();
    frame2 = undefined
  }
  return singleFrame
}

const setupSwapFrames = async (target: HTMLElement, filePath?: string) => {
  if (!frame1 || !frame2) {
    frame1 = await insertFrame('previewFramePaged.html', target, filePath)
    frame2 = await insertFrame('previewFramePaged.html', target, filePath)
  }
  if (singleFrame) {
    singleFrame.remove();
    singleFrame = undefined
  }
  if (singleFrameLinkEl) {
    singleFrameLinkEl.remove();
    singleFrameLinkEl = undefined;
  }
  return [frame1, frame2] as const
}

const renderAndSwap = async (
  previewDiv: HTMLDivElement
, filePath: string | undefined
, renderFn: (w: Window) => Promise<Window>
): Promise<Window> => {
  const [f1, f2] = await setupSwapFrames(previewDiv, filePath)
  if (!f1.contentWindow) {
    throw Error('f1.contentWindow was null in renderAndSwap')
  }
  return renderFn(f1.contentWindow).then(() => {
    if (!f2.contentWindow) {
      throw Error('f2.contentWindow was null in renderAndSwap')
    }
    f1.contentWindow?.scrollTo(0, f2.contentWindow.scrollY || 0)
    f1.style.top = '0'
    f2.style.top = '-1000vh'; // `display: none` would break pagedjs
    [frame2, frame1] = [frame1, frame2]
    return f2.contentWindow
  })
}


export const renderPlain = async (doc: Doc, previewDiv: HTMLDivElement): Promise<Window> => {
  const { contentWindow } = await setupSingleFrame(previewDiv, doc.filePath);
  const [cssStr, link, linkIsChanged] = await getCss(doc)
      , content = [
          '<style>', cssStr, '</style>'
        , doc.meta['header-includes']
        , doc.html
        ].join('')
  if (linkIsChanged && singleFrameLinkEl) {
    singleFrameLinkEl.remove()
    singleFrameLinkEl = undefined;
  }

  if (!contentWindow) {
    throw Error('contentWindow was undefined in renderPlain')
  }

  if (singleFrameLinkEl === undefined && link) {
    singleFrameLinkEl = createLinkEl(link)
    contentWindow.document.head.appendChild(singleFrameLinkEl)
  }
  contentWindow.document.body.innerHTML = content
  return contentWindow
}

const createStyleEl = (text: string) => {
  const style = document.createElement('style')
  style.textContent = text
  return style
}

const createLinkEl = (href: string): HTMLLinkElement => {
  const link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', href)
  return link
}

const pagedjsStyleEl = createStyleEl(`
@media screen {
  .pagedjs_pages {
    overflow: scroll;
    padding: 90px 50px 50px 50px;
  }

  .pagedjs_page {
    background-color: white;
    margin: 0 auto;
    margin-bottom: 50px;
  }
}
`);

export const renderPaged = async (doc: Doc, previewDiv: HTMLDivElement): Promise<Window> => {
  return renderAndSwap(previewDiv, doc.filePath, async frameWindow => {

    const [cssStr, link] = await getCss(doc)
        , metaHtml   = doc.meta['header-includes']
        , content    = doc.html
        , frameHead  = frameWindow.document.head
        , frameBody  = frameWindow.document.body
        ;

    // Unfortunately, pagedjs removes our style elements from <head>
    // and appends its transformed styles – on each render. Thus we not only
    // need to clear the body, but also remove the styles from the head.
    frameHead.querySelectorAll('style').forEach(s => s.remove())
    frameBody.innerHTML = content

    // repopulate styles
    // injectMathLib(frameWindow) // TODO: uncomment
    if (link) {
      frameHead.appendChild( createLinkEl(link) )
    }
    if (typeof metaHtml === 'string') {
      frameHead.insertAdjacentHTML('beforeend', metaHtml)
    }
    frameHead.appendChild( createStyleEl(cssStr) )
    frameHead.appendChild(pagedjsStyleEl);

    (frameWindow as any).PagedConfig = {
      auto: false
    };

    await new Promise(resolve => {
      const s = document.createElement('script')
      s.src = appPath + '/node_modules/pagedjs/dist/paged.polyfill.js'
      s.async = false
      s.addEventListener('load', resolve)
      frameBody.appendChild(s)
    })

    // wait for images etc. to have loaded
    await new Promise(resolve => {
      if (frameWindow.document.readyState === 'complete') {
        resolve(undefined)
      } else {
        frameWindow.addEventListener('load', resolve, {once: true})
      }
    })

    return (frameWindow as any).PagedPolyfill.preview()
  })
}