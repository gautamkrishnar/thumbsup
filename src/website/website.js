const fs = require('fs')
const path = require('path')
const async = require('async')
const resolvePkg = require('resolve-pkg')
const Theme = require('./theme')

exports.build = function (rootAlbum, opts, callback) {
  // create the base layer assets
  // such as shared JS libs, common handlebars helpers, CSS reset...
  const baseDir = path.join(__dirname, 'theme-base')
  const base = new Theme(baseDir, opts.output, {
    stylesheetName: 'core.css'
  })

  // then create the actual theme assets
  const themeDir = opts.themePath || localThemePath(opts.theme)
  const theme = new Theme(themeDir, opts.output, {
    stylesheetName: 'theme.css',
    customStylesPath: opts.themeStyle
  })

  // data passed to the template
  const themeSettings = readThemeSettings(opts.themeSettings)
  const templateData = {
    // deprecated "home", to be removed later
    gallery: Object.assign({}, opts, { home: rootAlbum }),
    settings: themeSettings,
    home: rootAlbum,
    // overwritten per page
    breadcrumbs: null,
    album: null
  }

  // and finally render each page
  const tasks = createRenderingTasks(theme, templateData, rootAlbum, [])

  // now build everything
  async.series([
    next => base.prepare(next),
    next => theme.prepare(next),
    next => async.parallel(tasks, next)
  ], callback)

  outputSEO(opts.output, opts.seoLocation, rootAlbum)
}

function createRenderingTasks (theme, templateData, currentAlbum, breadcrumbs) {
  // a function to render this album
  const thisAlbumTask = next => {
    theme.render(currentAlbum.path, Object.assign({}, templateData, {
      breadcrumbs: breadcrumbs,
      album: currentAlbum
    }), next)
  }
  const tasks = [thisAlbumTask]
  // and all nested albums
  currentAlbum.albums.forEach(function (nested) {
    const crumbs = breadcrumbs.concat([currentAlbum])
    const nestedTasks = createRenderingTasks(theme, templateData, nested, crumbs)
    Array.prototype.push.apply(tasks, nestedTasks)
  })
  return tasks
}

function localThemePath (themeName) {
  const local = resolvePkg(`@thumbsup/theme-${themeName}`, { cwd: __dirname })
  if (!local) {
    throw new Error(`Could not find a built-in theme called ${themeName}`)
  }
  return local
}

function readThemeSettings (filepath) {
  if (!filepath) {
    return {}
  }
  const content = fs.readFileSync(filepath).toString()
  try {
    return JSON.parse(content)
  } catch (ex) {
    throw new Error('Failed to parse JSON theme settings file: ' + filepath)
  }
}

function outputSEO (output, seoLocation, rootAlbum) {
  // SEO (sitemap and robots.txt)
  if (!seoLocation) {
    return
  }

  // Guaranteed to end with slash
  const seoPrefix = seoLocation + (seoLocation.endsWith('/') ? '' : '/')

  // Generate robots.txt
  const robotsTxt = 'User-Agent: *\nDisallow:\n\nSitemap: ' + seoPrefix + 'sitemap.xml\n'
  fs.writeFileSync(path.join(output, 'robots.txt'), robotsTxt)

  // Generate sitemap
  let sitemapXML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  const now = new Date().toISOString()

  function addToSitemap (album) {
    sitemapXML +=
      '    <url>\n' +
      '        <loc>' + seoPrefix + album.url + '</loc>\n' +
      '        <lastmod>' + now + '</lastmod>\n' +
      '    </url>\n'

    album.albums.forEach((subAlbum) => addToSitemap(subAlbum))
  }

  addToSitemap(rootAlbum)

  sitemapXML += '</urlset>\n'
  fs.writeFileSync(path.join(output, 'sitemap.xml'), sitemapXML)
}
