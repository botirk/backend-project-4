#!/usr/bin/env node
import { Command } from 'commander'
import { downloadPageToFolder } from '../src/main.js'

const cwd = process.cwd()
const program = new Command('page-loader')

program
    .usage('[options] <url>')
    .description('Page loader utility')
    .version('1', '-V, --version')
    .argument('<url>', 'url to download')
    .option('-o, --output <output>', `output dir (default: "${cwd}"`, cwd)
    .action((url, options) => {
        if (options.version) {
            console.log('Version 1')
        } else if (url) {
            downloadPageToFolder(url, options.output).then((path) => {
                console.log(path)
            }).catch((error) => {
                console.log(error.toString())
            })
        }
    })


program.parse()