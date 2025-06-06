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
  url = url.replace(/\.\w+?$/, '')
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
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'text/javascript':
      return '.js'
    case 'image/gif':
      return '.gif'
  }

  return '.html'
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
  task: () => {
    if (ctx.downloads?.[url]) return
    return new Promise((resolve, reject) => {
      ctx.downloads ??= {}
      fetch(url).then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            reject(new Error(`error 404 page not found '${url}'`))
          }
          else if (response.status === 403) {
            reject(new Error(`error 403 forbidden '${url}'`))
          }
          else if (response.status === 500) {
            reject(new Error(`error 500 server error '${url}'`))
          }
          else if (response.status === 401) {
            reject(new Error(`error 401 unauthorized '${url}'`))
          }
          else {
            reject(new Error(`error ${response.status} '${url}'`))
          }
        }
        else {
          let filename = getFilename(url) + getFormat(url, response)
          if (asText) {
            response.text().then((text) => {
              ctx.downloads[url] = { text, filename }
              resolve()
            }).catch(reject)
          }
          else {
            response.blob().then((blob) => {
              ctx.downloads[url] = { blob, filename }
              resolve()
            }).catch(reject)
          }
        }
      }).catch(() => reject(new Error(`could not resolve '${url}'`)))
    })
  },
})

const downloadQueuedResources = (asText = false) => ({
  title: 'Download queued resources',
  task: (ctx) => {
    return new Listr(
      ctx.queue.map(url => downloadResource(url, ctx, asText)),
      { rendererOptions: { collapseSubtasks: false }, concurrent: true },
    )
  },
})

const clearQueue = () => ({
  title: 'Clear queue',
  task: (ctx) => {
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
    const $ = ctx.cheerio = cheerio.load(Object.values(ctx.downloads)[0]?.text, { scriptingEnabled: false })

    ctx.cheerioIMGs ??= []
    for (const imgEl of $('img[src]')) {
      const oldSrc = imgEl.attribs.src
      const resolvedUrl = (new URL(oldSrc, pageUrl)).toString()
      ctx.queue.push(resolvedUrl)
      ctx.cheerioIMGs.push({ imgEl, resolvedUrl })
    }

    ctx.cheerioLINKs ??= []
    for (const linkEl of $('link[href]')) {
      const oldSrc = linkEl.attribs.href
      const urlObject = new URL(oldSrc, pageUrl)
      if (urlObject.host !== new URL(pageUrl).host) continue
      const resolvedUrl = urlObject.toString()
      ctx.queue.push(resolvedUrl)
      ctx.cheerioLINKs.push({ linkEl, resolvedUrl })
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
  task: () => {
    return new Promise((resolve, reject) => {
      fs.lstat(folder).then((stats) => {
        if (stats.isDirectory()) {
          fs.access(folder)
            .then(resolve)
            .catch(fsCatch(reject, folder))
        }
        else {
          reject(new Error(`'${folder}' is not directory`))
        }
      }).catch(fsCatch(reject, folder))
    })
  },
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
      cImg.blob = download.blob ?? new Blob([download.text])
      cImg.imgEl.attribs.src = relativePath + download.filename
      cImg.resultPath = resultPath + download.filename
    }

    for (const cLINK of ctx.cheerioLINKs) {
      const download = ctx.downloads[cLINK.resolvedUrl]
      cLINK.blob = download.blob ?? new Blob([download.text])
      cLINK.linkEl.attribs.href = relativePath + download.filename
      cLINK.resultPath = resultPath + download.filename
    }

    for (const cJS of ctx.cheerioJSs) {
      const download = ctx.downloads[cJS.resolvedUrl]
      cJS.blob = download.blob ?? new Blob([download.text])
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
    return new Promise((resolve, reject) => {
      fs.writeFile(resultPath, ctx.downloads[pageUrl].text)
        .then(() => {
          ctx.savedFiles.push(resultPath)
          resolve()
        }).catch(fsCatch(reject, resultPath))
    })
  },
})

const createResourcesFolder = (pageUrl, folder) => ({
  title: 'Create resources folder',
  skip: ctx => Object.keys(ctx.downloads).length <= 1,
  task: (ctx, task) => {
    ctx.resourcesFolder = folder + '/' + getFolder(pageUrl)
    task.title = `Create resources folder: '${ctx.resourcesFolder}'`
    return new Promise((resolve, reject) => {
      fs.access(ctx.resourcesFolder)
        .then(resolve)
        .catch(() => {
          fs.mkdir(ctx.resourcesFolder)
            .then(resolve)
            .catch(fsCatch(reject, ctx.resourcesFolder))
        })
    })
  },
})

const writeResource = resource => ({
  title: `Write resource '${resource.resolvedUrl}' to '${resource.resultPath}'`,
  task: (ctx) => {
    ctx.savedFiles ??= []
    return new Promise((resolve, reject) => {
      fs.writeFile(resource.resultPath, resource.blob.stream())
        .then(() => {
          ctx.savedFiles.push(resource.resultPath)
          resolve()
        }).catch(fsCatch(reject, resource.resultPath))
    })
  },
})

const writeResources = () => ({
  title: 'Write resources',
  skip: ctx => Object.keys(ctx.downloads).length <= 1,
  task: (ctx, task) => {
    const tasks = [
      ...ctx.cheerioIMGs.map(c => writeResource(c)),
      ...ctx.cheerioJSs.map(c => writeResource(c)),
      ...ctx.cheerioLINKs.map(c => writeResource(c)),
    ]
    task.title = `Write ${tasks.length} resources`
    return new Listr(tasks, { concurrent: true, rendererOptions: { collapseSubtasks: false } })
  },
})

/**
 *
 * @param {*} reject
 * @param {string} path
 * @returns {(error: Error) => void}
 */
const fsCatch = (reject, path) => (error) => {
  if (error.code === 'ENOENT') {
    reject(new Error(`no such file or directory '${path}'`))
  }
  else if (error.code === 'EACCES') {
    reject(new Error(`no access to '${path}'`))
  }
  else {
    reject(error)
  }
}

/**
 *
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
export const downloadPageWithResourcesToFolder = (pageUrl, folder = process.cwd()) => {
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
    createResourcesFolder(pageUrl, folder),
    writeResources(),
  ], { rendererOptions: { collapseSubtasks: false } })
  return list.run({ taskFolder: folder }).then(ctx => ctx.savedFiles)
}

export default downloadPageWithResourcesToFolder
