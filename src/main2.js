import fs from 'node:fs/promises'
import path from 'node:path'
import { Listr } from 'listr2'
import * as cheerio from 'cheerio'



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
                reject(new Error(`output directory '${folder}' no access`))
            })
            .catch(() => {
                reject(new Error(`output directory '${dirUp}' no access`))
            })
    }
    else if ('code' in error && error.code === 'EACCES') {
        reject(new Error(`no access to ${folder || filename}`))
    }
    else if (error.message.startsWith('404')) {
        reject(new Error(`error 404 no such page '${url}'`))
    }
    else if (error.message.startsWith('403')) {
        reject(new Error(`error 403 no access to page '${url}'`))
    }
    else {
        reject(error)
    }
}

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
                // @ts-ignore
                resolve()
                return;
            } else {
                fetch(url).then((response) => {
                    if (!response.ok) {
                        errorHandler(reject, url)(new Error(`${response.status}`))
                    } else {
                        let filename = getFilename(url) + getFormat(url, response)
                        if (asText) {
                            response.text().then((text) => {
                                ctx.downloads[url] = { text, filename }
                                // @ts-ignore
                                resolve()
                            }).catch(errorHandler(reject, url))
                        } else {
                            response.blob().then((blob) => {
                                ctx.downloads[url] = { blob, filename }
                                // @ts-ignore
                                resolve()
                            }).catch(errorHandler(reject, url))
                        }

                    }
                }).catch(() => errorHandler(reject, url)(new Error(`could not resolve ${url}`)))
            }
        })
    }
})

const downloadQueuedResources = (asText = false) => ({
    title: 'Download queued resources',
    task: (ctx, task) => {
        return new Listr(
            ctx.queue.map((url) => downloadResource(url, ctx, asText)),
            { rendererOptions: { collapseSubtasks: false }, concurrent: true }
        )
    }
})

const clearQueue = () => ({
    title: 'Clear queue',
    task: (ctx, task) => {
        ctx.queue = []
    }
})

const queueMainUrl = (pageUrl) => ({
    title: `Queue main page '${pageUrl}'`,
    task: (ctx) => {
        ctx.queue = [pageUrl]
    }
})

const parseHTMLandQueue = (pageUrl) => ({
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

        ctx.cheerioCSS ??= []
        for (const cssEl of $('link[rel="stylesheet"]')) {
            const oldSrc = cssEl.attribs.href
            const urlObject = new URL(oldSrc, pageUrl)
            if (urlObject.host !== new URL(pageUrl).host) continue
            const resolvedUrl = urlObject.toString()
            ctx.queue.push(resolvedUrl)
            ctx.cheerioCSS.push({ cssEl, resolvedUrl })
        }

        ctx.cheerioJS ??= []
        for (const jsEl of $('script[src]')) {
            const oldSrc = jsEl.attribs.src
            const urlObject = new URL(oldSrc, pageUrl)
            if (urlObject.host !== new URL(pageUrl).host) continue
            const resolvedUrl = urlObject.toString()
            ctx.queue.push(resolvedUrl)
            ctx.cheerioJS.push({ jsEl, resolvedUrl })
        }
    }
})

const checkFolder = (folder) => ({
    title: `Check output folder '${folder}'`,
    task: () => fs.access(folder).catch((e) => {
        if (e.code === 'ENOENT') {
            throw new Error(`folder '${folder}' does not exist`)
        } else {
            throw new Error(`no access to folder '${folder}'`)
        }
    })
})

const transformHTMLandResources = (pageUrl, folder) => ({
    title: 'Transform HTML and resources',
    task: (ctx) => {
        if (Object.keys(ctx.downloads).length <= 1) return

        ctx.resourcesFolder = folder + '/' + getFolder(pageUrl)
        const relativePath = getFolder(pageUrl) + '/'
        const resultPath = ctx.resourceFolder + '/'

        for (const cImg of ctx.cheerioIMGs) {
            const download = ctx.downloads[cImg.resolvedUrl]
            cImg.download = download.blob
            cImg.imgEl.attribs.src = relativePath + download.filename
            cImg.resultPath = resultPath + download.filename
        }

        for (const cCSS of ctx.cheerioIMGs) {
            const download = ctx.downloads[cCSS.resolvedUrl]
            cCSS.download = download.blob
            cCSS.cssEl.attribs.href = relativePath + download.filename
            cCSS.resultPath = resultPath + download.filename
        }

        for (const cJS of ctx.cheerioIMGs) {
            const download = ctx.downloads[cJS.resolvedUrl]
            cJS.download = download.blob
            cJS.jsEl.attribs.src = relativePath + download.filename
            cJS.resultPath = resultPath + download.filename
        }

        ctx.downloads[pageUrl].text = ctx.cheerio.html()
    }
})

const saveMainPage = (pageUrl, folder) => ({
    title: `Write main page '${pageUrl}'`,
    task: (ctx, task) => {
        task.title = `Write main page ${pageUrl} to ${ctx.downloads[pageUrl].filename}`
        return fs.writeFile(folder + '/' + ctx.downloads[pageUrl].filename, ctx.downloads[pageUrl].text)
    }
})

const createFolder = (pageUrl, folder) => ({
    title: `Create folder '${folder + '/' + getFolder(pageUrl)}'`,
    skip: ctx => Object.keys(ctx.downloads).length <= 1,
    task: () => {
        return new Promise((resolve, reject) => {
            fs.access(folder + '/' + getFolder(pageUrl))
                .then(resolve)
                .catch(() => {
                    fs.mkdir(folder + '/' + getFolder(pageUrl))
                        .then(resolve)
                        .catch((e) => {
                            // @ts-ignore
                            if (e instanceof Error && 'code' in e && e.code == 'EEXIST') resolve()
                            else errorHandler(reject, undefined, undefined, folder)(e)
                        })
                })
        })
    }
})

/**
 *
 * @param {string} pageUrl
 * @param {string} folder
 * @returns {Promise<void>}
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
        saveMainPage(pageUrl, folder),
        createFolder(pageUrl, folder)
    ], { rendererOptions: { collapseSubtasks: false } })
    return list.run({ taskFolder: folder })
}