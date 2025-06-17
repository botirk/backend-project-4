import fs from 'node:fs/promises'
import path from 'node:path'
import { debuglog } from 'node:util'
import { Listr } from 'listr2'
import * as cheerio from 'cheerio'

const debug = debuglog('page-loader')

/**
 * @param {string} url
 * @returns {string}
 */
const getFilename = (url) => {
  const { hostname, pathname } = new URL(url)
  const { dir, name } = path.parse(hostname + pathname) // exclude extension, because special function getExt
  return (`${dir}/${name}`).replaceAll(/[^\w\d]/g, '-')
}

/**
 * @param {string} url
 * @param {Response} response
 * @returns {string}
 */
const getExt = (url, response) => {
  const tryExt = path.extname(url)
  if (tryExt) return tryExt
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

const checkResponse = (url, response) => {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} '${url}'`)
}

const checkFolder = folder => ({
  title: `Check output folder '${folder}'`,
  task: () => fs.lstat(folder)
    .then((stats) => {
      if (stats.isDirectory()) {
        return fs.access(folder)
      }
      else {
        throw new Error(`'${folder}' is not directory`)
      }
    })
    .then(() => debug('check folder ok:', folder)),
})

const downloadMain = pageUrl => ({
  title: `Download main '${pageUrl}'`,
  task: (ctx) => {
    debug('fetch:', pageUrl)
    return fetch(pageUrl).then((response) => {
      debug('response:', response)
      checkResponse(pageUrl, response)
      return response.text().then(text => ctx.main = { text, filename: getFilename(pageUrl) + getExt(pageUrl, response) })
    })
  },
})

const parseMain = pageUrl => ({
  title: 'Parse main',
  task: (ctx) => {
    ctx.resourcesCount = 0
    const $ = ctx.cheerio = cheerio.load(ctx.main.text, { scriptingEnabled: false })

    ctx.cheerioIMGs ??= []
    for (const imgEl of $('img[src]')) {
      ctx.resourcesCount += 1
      const oldSrc = imgEl.attribs.src
      const resolvedUrl = (new URL(oldSrc, pageUrl)).toString()
      ctx.cheerioIMGs.push({ imgEl, resolvedUrl })
    }

    ctx.cheerioLINKs ??= []
    for (const linkEl of $('link[href]')) {
      ctx.resourcesCount += 1
      const oldSrc = linkEl.attribs.href
      const urlObject = new URL(oldSrc, pageUrl)
      if (urlObject.host !== new URL(pageUrl).host) continue
      const resolvedUrl = urlObject.toString()
      ctx.cheerioLINKs.push({ linkEl, resolvedUrl })
    }

    ctx.cheerioJSs ??= []
    for (const jsEl of $('script[src]')) {
      ctx.resourcesCount += 1
      const oldSrc = jsEl.attribs.src
      const urlObject = new URL(oldSrc, pageUrl)
      if (urlObject.host !== new URL(pageUrl).host) continue
      const resolvedUrl = urlObject.toString()
      ctx.cheerioJSs.push({ jsEl, resolvedUrl })
    }
  },
})

const downloadResource = resource => ({
  title: `Download resource '${resource.resolvedUrl}'`,
  task: () => {
    debug('fetch:', resource.resolvedUrl)
    return fetch(resource.resolvedUrl).then((response) => {
      debug('response:', response)
      checkResponse(resource.resolvedUrl, response)
      return response.blob().then(blob => resource.download = { blob, filename: getFilename(resource.resolvedUrl) + getExt(resource.resolvedUrl, response) })
    })
  },
})

const downloadResources = () => ({
  title: 'Download resources',
  skip: ctx => !ctx.resourcesCount,
  task: (ctx, task) => {
    task.title = `Download ${ctx.resourcesCount} resources`
    return new Listr(
      [
        ...ctx.cheerioIMGs.map(downloadResource),
        ...ctx.cheerioJSs.map(downloadResource),
        ...ctx.cheerioLINKs.map(downloadResource),
      ],
      { rendererOptions: { collapseSubtasks: false }, concurrent: true },
    )
  },
})

const transformMainAndResources = (pageUrl, folder) => ({
  title: 'Transform main and resources',
  skip: ctx => !ctx.resourcesCount,
  task: (ctx) => {
    ctx.resourcesFolder = path.join(folder, getFolder(pageUrl))
    const relativePath = getFolder(pageUrl)
    const resultPath = ctx.resourcesFolder

    for (const cImg of ctx.cheerioIMGs) {
      cImg.imgEl.attribs.src = relativePath + '/' + cImg.download.filename
      cImg.resultPath = path.join(resultPath, cImg.download.filename)
    }

    for (const cLINK of ctx.cheerioLINKs) {
      cLINK.linkEl.attribs.href = relativePath + '/' + cLINK.download.filename
      cLINK.resultPath = path.join(resultPath, cLINK.download.filename)
    }

    for (const cJS of ctx.cheerioJSs) {
      cJS.jsEl.attribs.src = relativePath + '/' + cJS.download.filename
      cJS.resultPath = path.join(resultPath, cJS.download.filename)
    }

    ctx.main.text = ctx.cheerio.html()
  },
})

const writeMain = (pageUrl, folder) => ({
  title: `Write main page '${pageUrl}'`,
  task: (ctx, task) => {
    const resultPath = path.join(folder, ctx.main.filename)
    task.title = `Write main page ${pageUrl} to ${resultPath}`
    return fs.writeFile(resultPath, ctx.main.text)
      .then(() => (ctx.savedFiles ??= []).push(resultPath))
      .then(() => debug('writeFile ok:', resultPath))
  },
})

const createResourcesFolder = (pageUrl, folder) => ({
  title: 'Create resources folder',
  skip: ctx => !ctx.resourcesCount,
  task: (ctx, task) => {
    ctx.resourcesFolder = path.join(folder, getFolder(pageUrl))
    task.title = `Create resources folder '${ctx.resourcesFolder}'`
    return fs.mkdir(ctx.resourcesFolder, { recursive: true })
      .then(() => debug('mdir ok:', ctx.resourcesFolder))
  },
})

const writeResource = resource => ({
  title: `Write resource '${resource.resolvedUrl}' to '${resource.resultPath}'`,
  task: (ctx) => {
    return fs.writeFile(resource.resultPath, resource.download.blob.stream())
      .then(() => (ctx.savedFiles ??= []).push(resource.resultPath))
      .then(() => debug('writeFile ok:', resource.resultPath))
  },
})

const writeResources = () => ({
  title: 'Write resources',
  skip: ctx => !ctx.resourcesCount,
  task: (ctx, task) => {
    const tasks = [
      ...ctx.cheerioIMGs.map(resource => writeResource(resource)),
      ...ctx.cheerioJSs.map(resource => writeResource(resource)),
      ...ctx.cheerioLINKs.map(resource => writeResource(resource)),
    ]
    task.title = `Write ${tasks.length} resources`
    return new Listr(tasks, { concurrent: true, rendererOptions: { collapseSubtasks: false } })
  },
})

/**
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
export default (pageUrl, folder = process.cwd()) => {
  folder = path.resolve(folder)
  const list = new Listr([
    checkFolder(folder),
    downloadMain(pageUrl),
    parseMain(pageUrl),
    downloadResources(),
    transformMainAndResources(pageUrl, folder),
    writeMain(pageUrl, folder),
    createResourcesFolder(pageUrl, folder),
    writeResources(),
  ], { rendererOptions: { collapseSubtasks: false } })
  return list.run({ taskFolder: folder }).then(ctx => ctx.savedFiles)
}
