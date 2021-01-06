import { BrowserWindow, dialog } from 'electron'
import { readFile, writeFile } from 'fs'
import { basename, extname } from 'path'
import { promisify } from 'util'
import * as ipc from './ipc'
import { Doc } from '../src/appState/AppState'


export const openFile = async (
  win: BrowserWindow
, filePath: string
): Promise<Partial<Doc> | undefined> => {
  const fileName = pathToName(filePath)

  try {
    const md = await promisify(readFile)(filePath, 'utf-8')
    win.setTitle(fileName)
    win.setRepresentedFilename(filePath)
    return { md, fileName, filePath, fileDirty: false }
  } catch (err) {
    dialog.showMessageBox(win, {
      type: 'error'
    , message: 'Could not open file'
    , detail: err.message
    })
    win.close()
  }
}

export const saveFile = async (
  win: BrowserWindow
, doc: Doc
, opts: {saveAsNewFile?: boolean; closeWindowAfterSave?: boolean} = {}
) => {
  const filePath = await showDialog(win, doc, opts.saveAsNewFile)

  if (!filePath) {
    return
  }

  writeFile(filePath, doc.md, err => {
    if (err) {
      dialog.showMessageBox(win, {
        type: 'error'
      , message: 'Could not save file'
      , detail: err.message
      })
    } else {
      const fileName = pathToName(filePath)
      win.setTitle(fileName)
      win.setRepresentedFilename(filePath)

      ipc.updateDoc(win, { fileName, filePath, fileDirty: false })
      if (opts.closeWindowAfterSave) {
        win.close()
      }
    }
  })
}

const showDialog = async (win: BrowserWindow, doc: Doc, saveAsNewFile?: boolean) => {
  let { filePath } = doc
  if (filePath === undefined || saveAsNewFile) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: 'Untitled.md'
    , filters: [
        { name: 'Markdown', extensions: ['md', 'txt', 'markdown'] }
      ]
    })
    filePath = res.filePath
  }
  return filePath
}

const pathToName = (filePath: string) =>
  basename(filePath, extname(filePath))
