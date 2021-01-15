const { getCss } = require('./templates/getCss')

/*
const path   = require('path')
    , shell  = require('electron').shell
    , app = require('electron').remote.app
    ;
*/

var singleFrame
  , singleFrameLinkEl
  , frame1
  , frame2
  ;

/*
function injectBaseTag(contentWindow, filePath) {
  // so relative image URLs etc. are found
  const cwd = path.dirname(filePath)
      , base = document.createElement('base')
      ;
  base.setAttribute("href", "file://" + cwd + path.sep);
  contentWindow.document.head.append(base);
}

function injectMathLib(contentWindow) {
  [ app.getAppPath() + "/node_modules/katex/dist/katex.min.css"
  , app.getAppPath() + "/node_modules/markdown-it-texmath/css/texmath.css"
  ].forEach(href => {
    contentWindow.document.head.appendChild( createLinkEl(href) );
  });
}

function interceptClicks(contentWindow, e) {
  e.preventDefault();
  e.returnValue = false;
  if (e.target.href) {
    const hrefStart = e.target.href.substr(0, 7);
    if (hrefStart === "file://" && e.target.hash) {
      // probably in-document navigation by hash
      const element = contentWindow.document.querySelector(e.target.hash);
      if (element) {
        element.scrollIntoView();
      }
    } else if(hrefStart === "http://" || hrefStart === "https:/") {
      // external link
      shell.openExternal(e.target.href);
    }
  }
  return false;
}
*/

async function insertFrame(src, target, filePath=undefined, sandbox=undefined) {
  const frame = document.createElement('iframe');
  if (sandbox !== undefined) {
    frame.setAttribute("sandbox", sandbox);
  }
  frame.setAttribute("src", src);
  frame.setAttribute("style", "width: 100%; height: 100%;");
  target.appendChild(frame);
  return new Promise(resolve => {
    const contentWindow = frame.contentWindow
    contentWindow.addEventListener('DOMContentLoaded', () => {
      /* TODO: uncomment
      if (filePath) {
        injectBaseTag(contentWindow, filePath);
      }
      injectMathLib(contentWindow);
      contentWindow.addEventListener("click", interceptClicks.bind(this, contentWindow));
      */
      return resolve(frame);
    })
  })
}

async function setupSingleFrame(target, filePath) {
  if (!singleFrame) {
    singleFrame = await insertFrame("previewFrame.html", target, filePath);
  }
  if (frame1) {
    frame1.remove();
    frame1 = undefined
  }
  if (frame2) {
    frame2.remove();
    frame2 = undefined
  }
}

async function setupSwapFrames(target, filePath) {
  if (!frame1) {
    frame1 = await insertFrame("previewFramePaged.html", target, filePath)
    frame2 = await insertFrame("previewFramePaged.html", target, filePath)
  }
  if (singleFrame) {
    singleFrame.remove();
    singleFrame = undefined
  }
  if (singleFrameLinkEl) {
    singleFrameLinkEl.remove();
    singleFrameLinkEl = undefined;
  }
}

async function renderAndSwap(previewDiv, filePath, renderFn) {
  await setupSwapFrames(previewDiv, filePath);
  return renderFn(frame1.contentWindow).then( function(){
    frame1.contentWindow.scrollTo(0, frame2.contentWindow.scrollY);
    frame1.style.top = '0';
    frame2.style.top = '-1000vh'; // `display: none` would break pagedjs
    [frame2, frame1] = [frame1, frame2];
    return frame2.contentWindow;
  });
}


export const renderPlain = async (doc, previewDiv) => {
  await setupSingleFrame(previewDiv, doc.filePath);
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
  if (singleFrameLinkEl === undefined && link) {
    singleFrameLinkEl = createLinkEl(link)
    singleFrame.contentDocument.head.appendChild(singleFrameLinkEl)
  }
  singleFrame.contentDocument.body.innerHTML = content;
  return singleFrame.contentWindow;
}

function createStyleEl(text) {
  const style = document.createElement('style');
  style.textContent = text;
  return style;
}

function createLinkEl(href) {
  const link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', href);
  return link;
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

export const renderPaged = undefined
/*
export const renderPaged = async (doc, previewDiv) => {
  return renderAndSwap(previewDiv, doc.getPath(), async (frameWindow) => {

    const [cssStr, link, _] = await doc.getCss()
        , metaHtml   = doc.getMeta()['header-includes']
        , content    = doc.getHtml()
        , frameHead  = frameWindow.document.head
        , frameBody  = frameWindow.document.body
        ;

    // Unfortunately, pagedjs removes our style elements from <head>
    // and appends its transformed styles – on each render. Thus we not only
    // need to clear the body, but also remove the styles from the head.
    frameHead.querySelectorAll('style').forEach(s => s.remove())
    frameBody.innerHTML = content;

    // repopulate styles
    injectMathLib(frameWindow);
    if (link) {
      frameHead.appendChild( createLinkEl(link) );
    }
    if (metaHtml) {
      frameHead.insertAdjacentHTML('beforeend', metaHtml);
    }
    frameHead.appendChild( createStyleEl(cssStr) );
    frameHead.appendChild(pagedjsStyleEl);

    frameWindow.PagedConfig = {
      auto: false
    };

    await new Promise(resolve => {
      const s = document.createElement('script');
      s.src = app.getAppPath() + '/node_modules/pagedjs/dist/paged.polyfill.js';
      s.async = false;
      s.addEventListener('load', resolve);
      frameBody.appendChild(s);
    });

    // wait for images etc. to have loaded
    await new Promise(resolve => {
      if (frameWindow.document.readyState === 'complete') {
        resolve();
      } else {
        frameWindow.addEventListener('load', resolve, {once: true});
      }
    })

    return frameWindow.PagedPolyfill.preview();
  })
}
*/
