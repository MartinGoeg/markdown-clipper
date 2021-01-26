if (chrome) {
    chrome.runtime.onMessage.addListener(notify);
    chrome.browserAction.onClicked.addListener(action);
} else {
    browser.runtime.onMessage.addListener(notify);
    browser.browserAction.onClicked.addListener(action);
}

function createReadableVersion(dom) {
    var reader = new Readability(dom);
    var article = reader.parse();
    return article;
}
function convertArticleToMarkdown(article, source) {
    var turndownService = new TurndownService()
    var gfm = turndownPluginGfm.gfm
    turndownService.use(gfm)
    var markdown = turndownService.turndown(article.content);
    var frontmatter = [];

    //add summary if exist
    if (!!article.excerpt) {
        markdown = "\n> " + article.excerpt + "\n\n" + markdown;
    }

    //add article titel as header
    markdown = "# " + article.title + "\n" + markdown;

    //add source if exist
    if (!!source) {
        frontmatter.source = source;
    }
    frontmatter.date = new Date().toISOString();


    const frontmatterstr = "---"
        +"\ntitle: " + article.title
        +"\nsource: " + frontmatter.source 
        +"\ndate: " + frontmatter.date 
        +"\nauthor: " + article.byline
        +"\ntags:"
        +"\n  - scraped"
        +"\n  - "+new URL(source).hostname
        +"\n---\n";

    markdown = frontmatterstr+markdown;
    
    return markdown;
}

function generateValidFileName(title) {
    //remove < > : " / \ | ? *
    var illegalRe = /[\/\?<>\\:\*\|":]/g;
    var name = title.replace(illegalRe, "");
    return name;
}

function downloadMarkdown(markdown, article) {
    var blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    if (chrome) {
        chrome.downloads.download({
            url: url,
            filename: generateValidFileName(article.title) + ".md",
            saveAs: true
        }, function (id) {
            chrome.downloads.onChanged.addListener((delta) => {
                //release the url for the blob
                if (delta.state && delta.state.current === "complete") {
                    if (delta.id === id) {
                        window.URL.revokeObjectURL(url);
                    }
                }
            });
        });
    } else {
        browser.downloads.download({
            url: url,
            filename: generateValidFileName(article.title) + ".md",
            incognito: true,
            saveAs: true
        }).then((id) => {
            browser.downloads.onChanged.addListener((delta) => {
                //release the url for the blob
                if (delta.state && delta.state.current === "complete") {
                    if (delta.id === id) {
                        window.URL.revokeObjectURL(url);
                    }
                }
            });
        }).catch((err) => {
            console.error("Download failed" + err)
        });
    }
}

function getJsonLD(dom) {
    const jsonldel = dom.querySelector('script[type="application/ld+json"]').innerHTML;

    var jsonLD
    if (jsonldel){
        jsonLD = JSON.parse(jsonldel);
    } else {
        jsonld = null;
    }
    
    return jsonLD;
}

//function that handles messages from the injected script into the site
function notify(message) {
    var parser = new DOMParser();
    var dom = parser.parseFromString(message.dom, "text/html");
    if (dom.documentElement.nodeName === "parsererror") {
        console.error("error while parsing");
    }
    var jsonLD = getJsonLD(dom);

    var article = createReadableVersion(dom);
    var markdown = convertArticleToMarkdown(article, message.source);
    if (jsonLD){
        markdown = markdown + JSON.stringify(jsonLD.author.name);
    }
    downloadMarkdown(markdown, article);
}

function action(){
    if (chrome) {
        chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
            var id = tabs[0].id;
            chrome.tabs.executeScript(id, {
                file: "/contentScript/pageScrapper.js"
            }, function() {
                console.log("Successfully injected");
            });

        });
    } else {
        browser.tabs.query({currentWindow: true, active: true})
            .then((tabs) => {
                var id = tabs[0].id;
                browser.tabs.executeScript(id, {
                    file: "/contentScript/pageScrapper.js"
                }).then( () => {
                    console.log("Successfully injected");
                }).catch( (error) => {
                    console.error(error);
                });
            });
    }
}
