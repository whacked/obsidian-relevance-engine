
export type Hiccup = Array<string | Object>

// NOTE: this breaks when given ["tag", [["sub1"], ["sub2"]]]
export function renderHiccup(
    hiccup: Hiccup,
    domElementCreator?: (...args: any) => HTMLElement,
    textElementCreator?: (...args: any) => Text,
): Node {
    const createDomElement = domElementCreator || ((tag: string) => document.createElement(tag))
    const createTextNode = textElementCreator || ((text: string) => document.createTextNode(text))

    if (!hiccup) {
        return createTextNode("")
    }
    if (hiccup instanceof Node) {
        return hiccup
    }
    if (hiccup.length == 0) {
        return createTextNode("")
    }
    if (typeof hiccup === "string") {
        return createTextNode(hiccup)
    }
    if (hiccup.length == 1 && Array.isArray(hiccup[0])) {
        return renderHiccup(hiccup[0])
    }

    let tag: string | null = null
    let shorthandAttrs: Record<string, any> = {
        id: null,
        class: null,
    }
    const tagWithQualifications = hiccup[0] as string
    if (tagWithQualifications.indexOf("#") > -1) {
        const i = tagWithQualifications.indexOf("#");
        const split = tagWithQualifications.split("#", 2)
        tag = tagWithQualifications.substring(0, i)
        shorthandAttrs.id = tagWithQualifications.substring(i + 1)
    }
    if (tagWithQualifications.indexOf(".") > -1) {
        const i = tagWithQualifications.indexOf(".");
        tag ||= tagWithQualifications.substring(0, i)
        shorthandAttrs.class = tagWithQualifications.substring(i + 1).replace(".", " ")
    }
    tag ||= tagWithQualifications
    const el = createDomElement(tag as string)
    let remain: Array<any>
    if (typeof hiccup[1] === "object" && !Array.isArray(hiccup[1])) {
        const attrs = Object.assign(shorthandAttrs, hiccup[1] as any)
        for (const attrName of Object.keys(attrs)) {
            const attrValue = attrs[attrName]
            if (attrValue == null) {
                continue
            } else if (attrName.toLowerCase().startsWith("on")) {
                const eventName = attrName.toLowerCase().replace(/^on-?/, "")
                el.addEventListener(eventName, attrValue)
            } else if (typeof attrValue === "object") {  // assume style
                const styleString = Object.keys(attrValue).map((key) => {
                    return `${key}:${attrValue[key]};`
                }).join('')
                el.setAttribute(attrName, styleString)
            } else {
                el.setAttribute(attrName, attrValue)
            }
        }
        remain = hiccup.slice(2)
    } else {
        remain = hiccup.slice(1)
    }
    for (const child of remain) {
        el.appendChild(renderHiccup(child))
    }
    return el
}
