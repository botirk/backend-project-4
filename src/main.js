/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import fs from 'node:fs/promises'
import path from 'node:path'
import { Listr } from 'listr2'
import * as cheerio from 'cheerio'

/**
 *
 * @param {string} url
 * @returns {void|string}
 */
const getFilename = (url) => {
  const parsed = new URL(url)
  if (parsed) {
    url = parsed.hostname + parsed.pathname
  }
  else {
    return
  }
  if (url.endsWith('.jpeg')) {
    url = url.slice(0, -5)
  }
  else if (url.endsWith('.png')) {
    url = url.slice(0, -4)
  }
  else if (url.endsWith('.jpg')) {
    url = url.slice(0, -4)
  }
  else if (url.endsWith('.css')) {
    url = url.slice(0, -4)
  }
  else if (url.endsWith('.js')) {
    url = url.slice(0, -3)
  }
  return url.replaceAll(/[^\w\d]/g, '-')
}

/**
 *
 * @param {string} url
 * @param {Response} response
 * @returns {string}
 */
const getFormat = (url, response) => {
  try {
    const tryExt = path.extname(new URL(url).pathname)
    if (tryExt) return tryExt
    // eslint-disable-next-line
    } catch { }

  switch (response.headers.get('content-type')) {
    case 'text/css':
      return '.css'
    case 'image/jpeg':
      return '.jpeg'
    case 'image/png':
      return '.png'
    case 'text/javascript':
      return '.js'
    default:
      return '.html'
  }
}

/**
 *
 * @param {string} pageUrl
 * @returns {string}
 */
const getFolder = (pageUrl) => {
  return getFilename(pageUrl) + '_files'
}

const downloadResource = (url, ctx, asText = false) => ({
  title: `Download '${url}' resource`,
  task: (_1, _2) => {
    return new Promise((resolve, reject) => {
      ctx.downloads ??= {}
      if (ctx.downloads[url]) {
        // @ts-expect-error promise is not typed
        resolve()
        return
      }
      else {
        fetch(url).then((response) => {
          if (!response.ok) {
            errorHandler(reject, url)(new Error(`${response.status}`))
          }
          else {
            let filename = getFilename(url) + getFormat(url, response)
            if (asText) {
              response.text().then((text) => {
                ctx.downloads[url] = { text, filename }
                // @ts-expect-errorpromise is not typed
                resolve()
              }).catch(errorHandler(reject, url))
            }
            else {
              response.blob().then((blob) => {
                ctx.downloads[url] = { blob, filename }
                // @ts-expect-error promise is not typed
                resolve()
              }).catch(errorHandler(reject, url))
            }
          }
        }).catch(() => errorHandler(reject, url)(new Error(`could not resolve ${url}`)))
      }
    })
  },
})

const downloadQueuedResources = (asText = false) => ({
  title: 'Download queued resources',
  task: (ctx, task) => {
    return new Listr(
      ctx.queue.map(url => downloadResource(url, ctx, asText)),
      { rendererOptions: { collapseSubtasks: false }, concurrent: true },
    )
  },
})

const clearQueue = () => ({
  title: 'Clear queue',
  task: (ctx, task) => {
    ctx.queue = []
  },
})

const queueMainUrl = pageUrl => ({
  title: `Queue main page '${pageUrl}'`,
  task: (ctx) => {
    ctx.queue = [pageUrl]
  },
})

const parseHTMLandQueue = pageUrl => ({
  title: 'Parse HTML and queue downloads',
  task: (ctx, task) => {
    task.title = 'Transforming HTML and queuing downloads'
    ctx.queue ??= []
    const $ = ctx.cheerio = cheerio.load(Object.values(ctx.downloads)[0]?.text)

    ctx.cheerioIMGs ??= []
    for (const imgEl of $('img')) {
      const oldSrc = imgEl.attribs.src
      const resolvedUrl = (new URL(oldSrc, pageUrl)).toString()
      ctx.queue.push(resolvedUrl)
      ctx.cheerioIMGs.push({ imgEl, resolvedUrl })
    }

    ctx.cheerioCSSs ??= []
    for (const cssEl of $('link[rel="stylesheet"]')) {
      const oldSrc = cssEl.attribs.href
      const urlObject = new URL(oldSrc, pageUrl)
      if (urlObject.host !== new URL(pageUrl).host) continue
      const resolvedUrl = urlObject.toString()
      ctx.queue.push(resolvedUrl)
      ctx.cheerioCSSs.push({ cssEl, resolvedUrl })
    }

    ctx.cheerioJSs ??= []
    for (const jsEl of $('script[src]')) {
      const oldSrc = jsEl.attribs.src
      const urlObject = new URL(oldSrc, pageUrl)
      if (urlObject.host !== new URL(pageUrl).host) continue
      const resolvedUrl = urlObject.toString()
      ctx.queue.push(resolvedUrl)
      ctx.cheerioJSs.push({ jsEl, resolvedUrl })
    }
  },
})

const checkFolder = folder => ({
  title: `Check output folder '${folder}'`,
  task: () => fs.access(folder).catch((e) => {
    if (e.code === 'ENOENT') {
      throw new Error(`folder '${folder}' does not exist`)
    }
    else {
      throw new Error(`no access to folder '${folder}'`)
    }
  }),
})

const transformHTMLandResources = (pageUrl, folder) => ({
  title: 'Transform HTML and resources',
  task: (ctx) => {
    if (Object.keys(ctx.downloads).length <= 1) return

    ctx.resourcesFolder = folder + '/' + getFolder(pageUrl)
    const relativePath = getFolder(pageUrl) + '/'
    const resultPath = ctx.resourcesFolder + '/'

    for (const cImg of ctx.cheerioIMGs) {
      const download = ctx.downloads[cImg.resolvedUrl]
      cImg.blob = download.blob
      cImg.imgEl.attribs.src = relativePath + download.filename
      cImg.resultPath = resultPath + download.filename
    }

    for (const cCSS of ctx.cheerioCSSs) {
      const download = ctx.downloads[cCSS.resolvedUrl]
      cCSS.blob = download.blob
      cCSS.cssEl.attribs.href = relativePath + download.filename
      cCSS.resultPath = resultPath + download.filename
    }

    for (const cJS of ctx.cheerioJSs) {
      const download = ctx.downloads[cJS.resolvedUrl]
      cJS.blob = download.blob
      cJS.jsEl.attribs.src = relativePath + download.filename
      cJS.resultPath = resultPath + download.filename
    }

    ctx.downloads[pageUrl].text = ctx.cheerio.html()
  },
})

const writeMainPage = (pageUrl, folder) => ({
  title: `Write main page '${pageUrl}'`,
  task: (ctx, task) => {
    task.title = `Write main page ${pageUrl} to ${ctx.downloads[pageUrl].filename}`
    ctx.savedFiles ??= []
    const resultPath = folder + '/' + ctx.downloads[pageUrl].filename
    return fs.writeFile(resultPath, ctx.downloads[pageUrl].text).then(() => ctx.savedFiles.push(resultPath))
  },
})

const createResourceFolder = (pageUrl, folder) => ({
  title: 'Create resource folder',
  skip: ctx => Object.keys(ctx.downloads).length <= 1,
  task: (ctx, task) => {
    ctx.resourcesFolder = folder + '/' + getFolder(pageUrl)
    task.title = `Create resource folder: ${ctx.resourcesFolder}`
    return new Promise((resolve, reject) => {
      fs.access(ctx.resourcesFolder)
        .then(resolve)
        .catch(() => {
          fs.mkdir(ctx.resourcesFolder)
            .then(resolve)
            .catch(errorHandler(reject, undefined, undefined, folder))
        })
    })
  },
})

const writeResource = resource => ({
  title: `Write resource '${resource.resolvedUrl}' to '${resource.resultPath}'`,
  task: (ctx) => {
    ctx.savedFiles ??= []
    return fs.writeFile(resource.resultPath, resource.blob.stream()).then(() => ctx.savedFiles.push(resource.resultPath))
  },
})

const writeResources = () => ({
  title: 'Write resources',
  skip: ctx => Object.keys(ctx.downloads).length <= 1,
  task: (ctx, task) => {
    const tasks = [
      ...ctx.cheerioIMGs.map(ci => writeResource(ci)),
      ...ctx.cheerioCSSs.map(cc => writeResource(cc)),
      ...ctx.cheerioJSs.map(cj => writeResource(cj)),
    ]
    task.title = `Write resources ${tasks.length}`
    return new Listr(tasks, { concurrent: true, rendererOptions: { collapseSubtasks: false } })
  },
})

/**
 *
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
export const downloadPageWithResourcesToFolder = (pageUrl, folder) => {
  folder = path.resolve(folder)
  const list = new Listr([
    checkFolder(folder),
    queueMainUrl(pageUrl),
    downloadQueuedResources(true),
    clearQueue(),
    parseHTMLandQueue(pageUrl),
    downloadQueuedResources(),
    clearQueue(),
    transformHTMLandResources(pageUrl, folder),
    writeMainPage(pageUrl, folder),
    createResourceFolder(pageUrl, folder),
    writeResources(),
  ], { rendererOptions: { collapseSubtasks: false } })
  return list.run({ taskFolder: folder }).then(ctx => ctx.savedFiles)
}

/**
 *
 * @param {*} reject
 * @param {string|void} url
 * @param {string|void} filename
 * @param {string|void} folder
 * @returns {(error: Error) => void}
 */
const errorHandler = (reject, url, filename, folder) => (error) => {
  if ('code' in error && error.code === 'ENOENT') {
    folder = path.resolve(folder ?? '.')
    const dirUp = path.resolve(folder, '..')
    fs.access(dirUp)
      .then(() => {
        reject(new Error(`output directory '${folder ?? 'undefined'}' no access`))
      })
      .catch(() => {
        reject(new Error(`output directory '${dirUp}' no access`))
      })
  }
  else if ('code' in error && error.code === 'EACCES') {
    reject(new Error(`no access to ${folder ?? filename ?? 'undefined'}`))
  }
  else if (error.message.startsWith('404')) {
    reject(new Error(`error 404 no such page '${url ?? 'undefined'}'`))
  }
  else if (error.message.startsWith('403')) {
    reject(new Error(`error 403 no access to page '${url ?? 'undefined'}'`))
  }
  else {
    reject(error)
  }
}
