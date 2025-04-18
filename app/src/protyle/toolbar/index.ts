import {Divider} from "./Divider";
import {Font, hasSameTextStyle, setFontStyle} from "./Font";
import {ToolbarItem} from "./ToolbarItem";
import {
    fixTableRange,
    focusBlock,
    focusByRange,
    focusByWbr,
    getEditorRange,
    getSelectionPosition,
    selectAll,
    setFirstNodeRange,
    setLastNodeRange
} from "../util/selection";
import {hasClosestBlock, hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import {Link} from "./Link";
import {setPosition} from "../../util/setPosition";
import {updateTransaction} from "../wysiwyg/transaction";
import {Constants} from "../../constants";
import {copyPlainText, openByMobile, readClipboard, setStorageVal} from "../util/compatibility";
import {upDownHint} from "../../util/upDownHint";
import {highlightRender} from "../render/highlightRender";
import {getContenteditableElement, hasNextSibling, hasPreviousSibling} from "../wysiwyg/getBlock";
import {processRender} from "../util/processCode";
import {BlockRef} from "./BlockRef";
import {hintRenderTemplate, hintRenderWidget} from "../hint/extend";
import {blockRender} from "../render/blockRender";
/// #if !BROWSER
import {openBy} from "../../editor/util";
/// #endif
import {fetchPost} from "../../util/fetch";
import {isArrayEqual, isMobile} from "../../util/functions";
import * as dayjs from "dayjs";
import {insertEmptyBlock} from "../../block/util";
import {matchHotKey} from "../util/hotKey";
import {hideElements} from "../ui/hideElements";
import {electronUndo} from "../undo";
import {previewTemplate, toolbarKeyToMenu} from "./util";
import {hideMessage, showMessage} from "../../dialog/message";
import {InlineMath} from "./InlineMath";
import {InlineMemo} from "./InlineMemo";
import {mathRender} from "../render/mathRender";
import {linkMenu} from "../../menus/protyle";
import {addScript} from "../util/addScript";
import {confirmDialog} from "../../dialog/confirmDialog";
import {paste, pasteAsPlainText, pasteEscaped} from "../util/paste";
import {escapeHtml} from "../../util/escape";
import {resizeSide} from "../../history/resizeSide";

export class Toolbar {
    public element: HTMLElement;
    public subElement: HTMLElement;
    public subElementCloseCB: () => void;
    public range: Range;
    public toolbarHeight: number;

    constructor(protyle: IProtyle) {
        const options = protyle.options;
        const element = document.createElement("div");
        element.className = "protyle-toolbar fn__none";
        this.element = element;
        this.subElement = document.createElement("div");
        /// #if MOBILE
        this.subElement.className = "protyle-util fn__none protyle-util--mobile";
        /// #else
        this.subElement.className = "protyle-util fn__none";
        /// #endif
        this.toolbarHeight = 29;
        protyle.app.plugins.forEach(item => {
            const pluginToolbar = item.updateProtyleToolbar(options.toolbar);
            pluginToolbar.forEach(toolbarItem => {
                if (typeof toolbarItem === "string" || Constants.INLINE_TYPE.concat("|").includes(toolbarItem.name) || !toolbarItem.hotkey) {
                    return;
                }
                if (window.siyuan.config.keymap.plugin && window.siyuan.config.keymap.plugin[item.name] && window.siyuan.config.keymap.plugin[item.name][toolbarItem.name]) {
                    toolbarItem.hotkey = window.siyuan.config.keymap.plugin[item.name][toolbarItem.name].custom;
                }
            });
            options.toolbar = toolbarKeyToMenu(pluginToolbar);
        });
        options.toolbar.forEach((menuItem: IMenuItem) => {
            const itemElement = this.genItem(protyle, menuItem);
            this.element.appendChild(itemElement);
        });
    }

    public update(protyle: IProtyle) {
        this.element.innerHTML = "";
        protyle.options.toolbar = toolbarKeyToMenu(Constants.PROTYLE_TOOLBAR);
        protyle.app.plugins.forEach(item => {
            const pluginToolbar = item.updateProtyleToolbar(protyle.options.toolbar);
            pluginToolbar.forEach(toolbarItem => {
                if (typeof toolbarItem === "string" || Constants.INLINE_TYPE.concat("|").includes(toolbarItem.name) || !toolbarItem.hotkey) {
                    return;
                }
                if (window.siyuan.config.keymap.plugin && window.siyuan.config.keymap.plugin[item.name] && window.siyuan.config.keymap.plugin[item.name][toolbarItem.name]) {
                    toolbarItem.hotkey = window.siyuan.config.keymap.plugin[item.name][toolbarItem.name].custom;
                }
            });
            protyle.options.toolbar = toolbarKeyToMenu(pluginToolbar);
        });
        protyle.options.toolbar.forEach((menuItem: IMenuItem) => {
            const itemElement = this.genItem(protyle, menuItem);
            this.element.appendChild(itemElement);
        });
    }

    public render(protyle: IProtyle, range: Range, event?: KeyboardEvent) {
        this.range = range;
        let nodeElement = hasClosestBlock(range.startContainer);
        if (isMobile() || !nodeElement || protyle.disabled || nodeElement.classList.contains("av")) {
            this.element.classList.add("fn__none");
            return;
        }
        // https://github.com/siyuan-note/siyuan/issues/5157
        let hasText = false;
        Array.from(range.cloneContents().childNodes).find(item => {
            // zwsp 不显示工具栏
            if (item.textContent.length > 0 && item.textContent !== Constants.ZWSP) {
                if (item.nodeType === 1 && (item as HTMLElement).classList.contains("img")) {
                    // 图片不显示工具栏
                } else {
                    hasText = true;
                    return true;
                }
            }
        });
        if (!hasText ||
            // 拖拽图片到最右侧
            (range.commonAncestorContainer.nodeType !== 3 && (range.commonAncestorContainer as HTMLElement).classList.contains("img"))) {
            this.element.classList.add("fn__none");
            return;
        }
        // shift+方向键或三击选中，不同的块 https://github.com/siyuan-note/siyuan/issues/3891
        const startElement = hasClosestBlock(range.startContainer);
        const endElement = hasClosestBlock(range.endContainer);
        if (startElement && endElement && !startElement.isSameNode(endElement)) {
            if (event) { // 在 keyup 中使用 shift+方向键选中
                if (event.key === "ArrowLeft") {
                    this.range = setLastNodeRange(getContenteditableElement(startElement), range, false);
                } else if (event.key === "ArrowRight") {
                    this.range = setFirstNodeRange(getContenteditableElement(endElement), range);
                    this.range.collapse(false);
                } else if (event.key === "ArrowUp") {
                    this.range = setFirstNodeRange(getContenteditableElement(endElement), range);
                    nodeElement = hasClosestBlock(endElement);
                    if (!nodeElement) {
                        return;
                    }
                } else if (event.key === "ArrowDown") {
                    this.range = setLastNodeRange(getContenteditableElement(startElement), range, false);
                }
            } else {
                this.range = setLastNodeRange(getContenteditableElement(nodeElement), range, false);
            }
            focusByRange(this.range);
            if (this.range.toString() === "") {
                this.element.classList.add("fn__none");
                return;
            }
        }
        // 需放在 range 修改之后，否则 https://github.com/siyuan-note/siyuan/issues/4726
        if (nodeElement.getAttribute("data-type") === "NodeCodeBlock") {
            this.element.classList.add("fn__none");
            return;
        }
        const rangePosition = getSelectionPosition(nodeElement, range);
        this.element.classList.remove("fn__none");
        this.toolbarHeight = this.element.clientHeight;
        const y = rangePosition.top - this.toolbarHeight - 4;
        this.element.setAttribute("data-inity", y + Constants.ZWSP + protyle.contentElement.scrollTop.toString());
        setPosition(this.element, rangePosition.left - 52, Math.max(y, protyle.element.getBoundingClientRect().top + 30));
        this.element.querySelectorAll(".protyle-toolbar__item--current").forEach(item => {
            item.classList.remove("protyle-toolbar__item--current");
        });
        const types = this.getCurrentType();
        types.forEach(item => {
            if (["search-mark", "a", "block-ref", "virtual-block-ref", "text", "file-annotation-ref", "inline-math",
                "inline-memo", "", "backslash"].includes(item)) {
                return;
            }
            const itemElement = this.element.querySelector(`[data-type="${item}"]`);
            if (itemElement) {
                itemElement.classList.add("protyle-toolbar__item--current");
            }
        });
    }

    public getCurrentType(range = this.range) {
        let types: string[] = [];
        let startElement = range.startContainer as HTMLElement;
        if (startElement.nodeType === 3) {
            startElement = startElement.parentElement;
        } else if (startElement.childElementCount > 0 && startElement.childNodes[range.startOffset]?.nodeType !== 3) {
            startElement = startElement.childNodes[range.startOffset] as HTMLElement;
        }
        if (!startElement || startElement.nodeType === 3) {
            return [];
        }
        if (!["DIV", "TD", "TH", "TR"].includes(startElement.tagName)) {
            types = (startElement.getAttribute("data-type") || "").split(" ");
        }
        let endElement = range.endContainer as HTMLElement;
        if (endElement.nodeType === 3) {
            endElement = endElement.parentElement;
        } else if (endElement.childElementCount > 0 && endElement.childNodes[range.endOffset]?.nodeType !== 3) {
            endElement = endElement.childNodes[range.endOffset] as HTMLElement;
        }
        if (!endElement || endElement.nodeType === 3) {
            return [];
        }
        if (!["DIV", "TD", "TH", "TR"].includes(endElement.tagName) && !startElement.isSameNode(endElement)) {
            types = types.concat((endElement.getAttribute("data-type") || "").split(" "));
        }
        range.cloneContents().childNodes.forEach((item: HTMLElement) => {
            if (item.nodeType !== 3) {
                types = types.concat((item.getAttribute("data-type") || "").split(" "));
            }
        });
        types = [...new Set(types)];
        types.find((item, index) => {
            if (item === "") {
                types.splice(index, 1);
                return true;
            }
        });
        return types;
    }

    public setInlineMark(protyle: IProtyle, type: string, action: "range" | "toolbar", textObj?: ITextOption) {
        const nodeElement = hasClosestBlock(this.range.startContainer);
        if (!nodeElement || nodeElement.getAttribute("data-type") === "NodeCodeBlock") {
            return;
        }
        const endElement = hasClosestBlock(this.range.endContainer);
        if (!endElement) {
            return;
        }
        // 三击后还没有重新纠正 range 时使用快捷键标记会导致异常 https://github.com/siyuan-note/siyuan/issues/7068
        if (!nodeElement.isSameNode(endElement)) {
            this.range = setLastNodeRange(getContenteditableElement(nodeElement), this.range, false);
        }
        const rangeTypes = this.getCurrentType(this.range);

        if (rangeTypes.length === 1) {
            // https://github.com/siyuan-note/siyuan/issues/6501
            // https://github.com/siyuan-note/siyuan/issues/12877
            if (["block-ref", "virtual-block-ref", "file-annotation-ref", "a", "inline-memo", "inline-math", "tag"].includes(rangeTypes[0]) && type === "clear") {
                return;
            }
        }
        // https://github.com/siyuan-note/siyuan/issues/14534
        if (rangeTypes.includes("text") && type === "text" && textObj && this.range.startContainer.nodeType === 3 && this.range.startContainer.isSameNode(this.range.endContainer)) {
            const selectParentElement = this.range.startContainer.parentElement;
            if (selectParentElement && hasSameTextStyle(null, selectParentElement, textObj)) {
                return;
            }
        }

        const selectText = this.range.toString();
        fixTableRange(this.range);
        let previousElement: HTMLElement;
        let nextElement: HTMLElement;
        let previousIndex: number;
        let nextIndex: number;
        const previousSibling = hasPreviousSibling(this.range.startContainer);
        if (!["DIV", "TD", "TH", "TR"].includes(this.range.startContainer.parentElement.tagName)) {
            if (this.range.startOffset === 0 && !previousSibling) {
                previousElement = this.range.startContainer.parentElement.previousSibling as HTMLElement;
                this.range.setStartBefore(this.range.startContainer.parentElement);
            } else {
                previousElement = this.range.startContainer.parentElement;
            }
        } else if (previousSibling && previousSibling.nodeType !== 3 && this.range.startOffset === 0) {
            // **aaa**bbb 选中 bbb 加粗
            previousElement = previousSibling as HTMLElement;
        } else if (["code", "tag", "kbd"].includes(type) && previousSibling && previousSibling.nodeType === 1 &&
            this.range.startOffset === 1 && this.range.startContainer.textContent.startsWith(Constants.ZWSP)) {
            // 合并相同元素第二条第一个操作 https://github.com/siyuan-note/siyuan/issues/14290
            previousElement = previousSibling as HTMLElement;
        }
        let isEndSpan = false;
        const nextSibling = hasNextSibling(this.range.endContainer);
        if (!["DIV", "TD", "TH", "TR"].includes(this.range.endContainer.parentElement.tagName)) {
            if (this.range.endOffset === this.range.endContainer.textContent.length && !nextSibling) {
                nextElement = this.range.endContainer.parentElement.nextSibling as HTMLElement;
                this.range.setEndAfter(this.range.endContainer.parentElement);
                if (selectText === "") {
                    isEndSpan = true;
                    this.range.collapse(false);
                }
            } else {
                nextElement = this.range.endContainer.parentElement;
            }
        } else if (nextSibling && nextSibling.nodeType !== 3 && this.range.endOffset === this.range.endContainer.textContent.length) {
            // aaa**bbb** 选中 aaa 加粗
            nextElement = nextSibling as HTMLElement;
        }
        this.range.insertNode(document.createElement("wbr"));
        const html = nodeElement.outerHTML;
        const contents = this.range.extractContents();
        this.mergeNode(contents.childNodes);
        // 选择 span 中的一部分需进行包裹
        if (previousElement && nextElement && previousElement.isSameNode(nextElement) && contents.firstChild?.nodeType === 3) {
            const attributes = previousElement.attributes;
            contents.childNodes.forEach(item => {
                const spanElement = document.createElement("span");
                for (let i = 0; i < attributes.length; i++) {
                    spanElement.setAttribute(attributes[i].name, attributes[i].value);
                }
                spanElement.innerHTML = item.textContent;
                item.replaceWith(spanElement);
            });
        }
        const toolbarElement = isMobile() ? document.querySelector("#keyboardToolbar .keyboard__dynamic").nextElementSibling : this.element;
        const actionBtn = action === "toolbar" ? toolbarElement.querySelector(`[data-type="${type}"]`) : undefined;
        const newNodes: Node[] = [];

        if (type === "clear" || actionBtn?.classList.contains("protyle-toolbar__item--current") || (
            action === "range" && rangeTypes.length > 0 && rangeTypes.includes(type) && !textObj
        )) {
            // 移除
            if (type === "clear") {
                toolbarElement.querySelectorAll('[data-type="strong"],[data-type="em"],[data-type="u"],[data-type="s"],[data-type="mark"],[data-type="sup"],[data-type="sub"],[data-type="kbd"],[data-type="mark"],[data-type="code"]').forEach(item => {
                    item.classList.remove("protyle-toolbar__item--current");
                });
            } else if (actionBtn) {
                actionBtn.classList.remove("protyle-toolbar__item--current");
            }
            if (contents.childNodes.length === 0) {
                rangeTypes.find((itemType, index) => {
                    if (type === itemType) {
                        rangeTypes.splice(index, 1);
                        return true;
                    }
                });
                if (rangeTypes.length === 0 || type === "clear") {
                    newNodes.push(document.createTextNode(Constants.ZWSP));
                } else {
                    // 遇到以下类型结尾不应继承 https://github.com/siyuan-note/siyuan/issues/7200
                    let removeIndex = 0;
                    while (removeIndex < rangeTypes.length) {
                        if (["inline-memo", "text", "block-ref", "virtual-block-ref", "file-annotation-ref", "a"].includes(rangeTypes[removeIndex])) {
                            rangeTypes.splice(removeIndex, 1);
                        } else {
                            ++removeIndex;
                        }
                    }
                    const inlineElement = document.createElement("span");
                    inlineElement.setAttribute("data-type", rangeTypes.join(" "));
                    inlineElement.textContent = Constants.ZWSP;
                    newNodes.push(inlineElement);
                }
            }
            contents.childNodes.forEach((item: HTMLElement, index) => {
                if (item.nodeType !== 3 && item.tagName !== "BR" && item.tagName !== "IMG" && !item.classList.contains("img")) {
                    // 图片后有粗体，仅选中图片后，rang 中会包含一个空的粗体，需移除
                    if (item.textContent === "") {
                        return;
                    }
                    const types = (item.getAttribute("data-type") || "").split(" ");
                    if (type === "clear") {
                        for (let i = 0; i < types.length; i++) {
                            if (textObj && textObj.type === "text") {
                                if ("text" === types[i]) {
                                    types.splice(i, 1);
                                    i--;
                                }
                            } else {
                                if (["kbd", "text", "strong", "em", "u", "s", "mark", "sup", "sub", "code"].includes(types[i])) {
                                    types.splice(i, 1);
                                    i--;
                                }
                            }
                        }
                    } else {
                        types.find((itemType, typeIndex) => {
                            if (type === itemType) {
                                types.splice(typeIndex, 1);
                                return true;
                            }
                        });
                    }
                    if (types.length === 0) {
                        if (item.textContent === "") {
                            item.textContent = Constants.ZWSP;
                        }
                        newNodes.push(document.createTextNode(item.textContent));
                    } else {
                        if (selectText && type === "clear" && textObj && textObj.type === "text") {
                            // 选中内容中没有样式需要清除时直接返回，否则清除粗体中部分内容会报错
                            if (item.style.color === "" && item.style.webkitTextFillColor === "" && item.style.webkitTextStroke === "" && item.style.textShadow === "" && item.style.backgroundColor === "" && item.style.fontSize === "") {
                                item.setAttribute("data-type", types.join(" "));
                                newNodes.push(item);
                                return true;
                            }
                        }
                        if (type === "clear") {
                            item.style.color = "";
                            item.style.webkitTextFillColor = "";
                            item.style.webkitTextStroke = "";
                            item.style.textShadow = "";
                            item.style.backgroundColor = "";
                            item.style.fontSize = "";
                        }
                        const previousIsSame = index === 0 && previousElement && previousElement.nodeType !== 3 &&
                            isArrayEqual(types, (previousElement.getAttribute("data-type") || "").split(" ")) &&
                            hasSameTextStyle(item, previousElement, textObj);
                        const nextIsSame = index === contents.childNodes.length - 1 && nextElement && nextElement.nodeType !== 3 &&
                            isArrayEqual(types, (nextElement.getAttribute("data-type") || "").split(" ")) &&
                            hasSameTextStyle(item, nextElement, textObj);
                        if (previousIsSame) {
                            previousIndex = previousElement.textContent.length;
                            previousElement.innerHTML = previousElement.innerHTML + item.innerHTML;
                            if (nextIsSame) {
                                nextIndex = previousElement.textContent.length;
                                previousElement.innerHTML = previousElement.innerHTML + nextElement.innerHTML;
                                nextElement.remove();
                                nextElement = previousElement;
                            }
                        } else if (nextIsSame) {
                            nextIndex = item.textContent.length;
                            nextElement.innerHTML = item.innerHTML + nextElement.innerHTML;
                        } else {
                            item.setAttribute("data-type", types.join(" "));
                            newNodes.push(item);
                        }
                    }
                } else {
                    newNodes.push(item);
                }
            });
        } else {
            // 添加
            if (!this.element.classList.contains("fn__none") && type !== "text" && actionBtn) {
                actionBtn.classList.add("protyle-toolbar__item--current");
            }
            if (selectText === "") {
                const inlineElement = document.createElement("span");
                rangeTypes.push(type);

                // 遇到以下类型结尾不应继承 https://github.com/siyuan-note/siyuan/issues/7200
                if (isEndSpan) {
                    let removeIndex = 0;
                    while (removeIndex < rangeTypes.length) {
                        if (["inline-memo", "text", "block-ref", "virtual-block-ref", "file-annotation-ref", "a"].includes(rangeTypes[removeIndex])) {
                            rangeTypes.splice(removeIndex, 1);
                        } else {
                            ++removeIndex;
                        }
                    }
                    // https://github.com/siyuan-note/siyuan/issues/14421
                    if (rangeTypes.length === 0) {
                        rangeTypes.push(type);
                    }
                }
                inlineElement.setAttribute("data-type", [...new Set(rangeTypes)].join(" "));
                inlineElement.textContent = Constants.ZWSP;
                // 在 a 元素中 ctrl+m 需继承其链接，也许不需要？没有用户反馈之前先保持现状
                // if (type !== "a" && rangeTypes.includes("a") && nextElement.dataset.type.split(" ").includes("a") &&
                //     nextElement.isSameNode(previousElement)) {
                //     inlineElement.setAttribute("data-href", nextElement.getAttribute("data-href"));
                // }
                setFontStyle(inlineElement, textObj);
                newNodes.push(inlineElement);
            } else {
                // https://github.com/siyuan-note/siyuan/issues/7477
                // https://github.com/siyuan-note/siyuan/issues/8825
                if (type === "block-ref") {
                    while (contents.childNodes.length > 1) {
                        contents.childNodes[0].remove();
                    }
                }
                contents.childNodes.forEach((item: HTMLElement, index) => {
                    let removeText = "";
                    if (item.nodeType === 3) {
                        if (index === 0 && previousElement && previousElement.nodeType !== 3 &&
                            type === previousElement.getAttribute("data-type") &&
                            hasSameTextStyle(item, previousElement, textObj)) {
                            previousIndex = previousElement.textContent.length;
                            previousElement.innerHTML = previousElement.innerHTML + item.textContent;
                        } else if (index === contents.childNodes.length - 1 && nextElement && nextElement.nodeType !== 3 &&
                            type === nextElement.getAttribute("data-type") &&
                            hasSameTextStyle(item, nextElement, textObj)) {
                            nextIndex = item.textContent.length;
                            nextElement.innerHTML = item.textContent + nextElement.innerHTML;
                        } else if (
                            // 图片会有零宽空格，但图片不进行处理 https://github.com/siyuan-note/siyuan/issues/12840
                            item.textContent !== Constants.ZWSP ||
                            // tag 会有零宽空格 https://github.com/siyuan-note/siyuan/issues/12922
                            (item.textContent === Constants.ZWSP && !rangeTypes.includes("img"))) {
                            // ZWSP spin 后会在行内元素外 https://github.com/siyuan-note/siyuan/issues/13871
                            if (item.textContent.startsWith(Constants.ZWSP) &&
                                // https://github.com/siyuan-note/siyuan/issues/14639
                                item.textContent.length > 1) {
                                newNodes.push(document.createTextNode(Constants.ZWSP));
                                item.textContent = item.textContent.substring(1);
                            }
                            if (item.textContent) {
                                // https://github.com/siyuan-note/siyuan/issues/14204
                                while (item.textContent.endsWith("\n")) {
                                    item.textContent = item.textContent.substring(0, item.textContent.length - 1);
                                    removeText += "\n";
                                }
                                const inlineElement = document.createElement("span");
                                inlineElement.setAttribute("data-type", type);
                                inlineElement.textContent = item.textContent;
                                setFontStyle(inlineElement, textObj);
                                // 合并相同元素 https://github.com/siyuan-note/siyuan/issues/14290
                                const previousIsSame = index === 0 && previousElement && previousElement.nodeType !== 3 &&
                                    type === previousElement.getAttribute("data-type") &&
                                    hasSameTextStyle(inlineElement, previousElement, textObj);
                                const nextIsSame = index === contents.childNodes.length - 1 && nextElement && nextElement.nodeType !== 3 &&
                                    type === nextElement.getAttribute("data-type") &&
                                    hasSameTextStyle(inlineElement, nextElement, textObj);
                                if (previousIsSame) {
                                    previousIndex = previousElement.textContent.length;
                                    previousElement.innerHTML = previousElement.innerHTML + inlineElement.innerHTML.replace(Constants.ZWSP, "");
                                    if (nextIsSame) {
                                        nextIndex = previousElement.textContent.length;
                                        previousElement.innerHTML = previousElement.innerHTML + nextElement.innerHTML.replace(Constants.ZWSP, "");
                                        const nextPrevSibling = hasPreviousSibling(nextElement);
                                        if (nextPrevSibling && nextPrevSibling.textContent === Constants.ZWSP) {
                                            nextPrevSibling.remove();
                                        }
                                        nextElement.remove();
                                        nextElement = previousElement;
                                    }
                                } else if (nextIsSame) {
                                    nextIndex = inlineElement.textContent.length;
                                    nextElement.innerHTML = inlineElement.innerHTML + nextElement.innerHTML.replace(Constants.ZWSP, "");
                                } else {
                                    if (type === "text" && !inlineElement.getAttribute("style")) {
                                        newNodes.push(item);
                                    } else {
                                        newNodes.push(inlineElement);
                                    }
                                }
                            }
                        } else {
                            newNodes.push(item);
                        }
                    } else {
                        let types = (item.getAttribute("data-type") || "").split(" ");
                        for (let i = 0; i < types.length; i++) {
                            // "backslash", "virtual-block-ref", "search-mark" 只能单独存在
                            if (["backslash", "virtual-block-ref", "search-mark"].includes(types[i])) {
                                types.splice(i, 1);
                                i--;
                            }
                        }
                        if (!types.includes("img")) {
                            types.push(type);
                        }
                        // 以下行内元素需用 ZWSP 开头 https://github.com/siyuan-note/siyuan/issues/13871
                        if ((types.includes("code") || types.includes("tag") || types.includes("kbd")) &&
                            !item.textContent.startsWith(Constants.ZWSP)) {
                            item.insertAdjacentText("afterbegin", Constants.ZWSP);
                        }
                        // 上标和下标不能同时存在 https://github.com/siyuan-note/insider/issues/1049
                        if (type === "sub" && types.includes("sup")) {
                            types.find((item, index) => {
                                if (item === "sup") {
                                    types.splice(index, 1);
                                    toolbarElement.querySelector('[data-type="sup"]').classList.remove("protyle-toolbar__item--current");
                                    return true;
                                }
                            });
                        } else if (type === "sup" && types.includes("sub")) {
                            types.find((item, index) => {
                                if (item === "sub") {
                                    types.splice(index, 1);
                                    toolbarElement.querySelector('[data-type="sub"]').classList.remove("protyle-toolbar__item--current");
                                    return true;
                                }
                            });
                        } else if (type === "block-ref" && (types.includes("a") || types.includes("file-annotation-ref"))) {
                            // 虚拟引用和链接/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "a" || item === "file-annotation-ref") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "a" && (types.includes("block-ref") || types.includes("file-annotation-ref"))) {
                            // 链接和引用/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "block-ref" || item === "file-annotation-ref") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "file-annotation-ref" && (types.includes("block-ref") || types.includes("a"))) {
                            // 引用和链接/标注不能同时存在
                            types.find((item, index) => {
                                if (item === "block-ref" || item === "a") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        } else if (type === "inline-memo" && types.includes("inline-math")) {
                            // 数学公式和备注不能同时存在
                            types.find((item, index) => {
                                if (item === "inline-math") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                            if (item.querySelector(".katex")) {
                                // 选中完整的数学公式才进行备注 https://github.com/siyuan-note/siyuan/issues/13667
                                item.textContent = item.getAttribute("data-content");
                            }
                        } else if (type === "inline-math" && types.includes("inline-memo")) {
                            // 数学公式和备注不能同时存在
                            types.find((item, index) => {
                                if (item === "inline-memo") {
                                    types.splice(index, 1);
                                    return true;
                                }
                            });
                        }
                        types = [...new Set(types)];
                        if (types.includes("block-ref") && item.getAttribute("data-subtype") === "d") {
                            // https://github.com/siyuan-note/siyuan/issues/14299
                            if (previousElement && previousElement.nodeType !== 3 && previousElement.getAttribute("data-id") === item.getAttribute("data-id")) {
                                previousElement.setAttribute("data-subtype", "s");
                                item.setAttribute("data-subtype", "s");
                            }
                            if (nextElement && nextElement.nodeType !== 3 && nextElement.getAttribute("data-id") === item.getAttribute("data-id")) {
                                nextElement.setAttribute("data-subtype", "s");
                                item.setAttribute("data-subtype", "s");
                            }
                        }
                        let previousIsSame = false;
                        previousIsSame = index === 0 && previousElement && previousElement.nodeType !== 3 &&
                            isArrayEqual(types, (previousElement.getAttribute("data-type") || "").split(" ")) &&
                            hasSameTextStyle(item, previousElement, textObj);
                        if (index === 0 && !previousIsSame && previousElement && previousElement.nodeType === 3 && previousElement.textContent === Constants.ZWSP) {
                            const tempPreviousElement = previousElement.previousSibling as HTMLElement;
                            previousIsSame = tempPreviousElement && tempPreviousElement.nodeType !== 3 &&
                                isArrayEqual(types, (tempPreviousElement.getAttribute("data-type") || "").split(" ")) &&
                                hasSameTextStyle(item, tempPreviousElement, textObj);
                            if (previousIsSame) {
                                previousElement.remove();
                                previousElement = tempPreviousElement;
                            }
                        }
                        const nextIsSame = index === contents.childNodes.length - 1 && nextElement && nextElement.nodeType !== 3 &&
                            isArrayEqual(types, (nextElement.getAttribute("data-type") || "").split(" ")) &&
                            hasSameTextStyle(item, nextElement, textObj);
                        if (previousIsSame) {
                            previousIndex = previousElement.textContent.length;
                            previousElement.innerHTML = previousElement.innerHTML + item.innerHTML.replace(Constants.ZWSP, "");
                            if (nextIsSame) {
                                nextIndex = previousElement.textContent.length;
                                previousElement.innerHTML = previousElement.innerHTML + nextElement.innerHTML.replace(Constants.ZWSP, "");
                                nextElement.remove();
                                nextElement = previousElement;
                            }
                        } else if (nextIsSame) {
                            nextIndex = item.textContent.length;
                            nextElement.innerHTML = item.innerHTML + nextElement.innerHTML.replace(Constants.ZWSP, "");
                        } else if (item.tagName !== "BR" && item.tagName !== "IMG") {
                            item.setAttribute("data-type", types.join(" "));
                            setFontStyle(item, textObj);
                            if (types.includes("text") && !item.getAttribute("style")) {
                                if (types.length === 1) {
                                    const tempText = document.createTextNode(item.textContent);
                                    newNodes.push(tempText);
                                } else {
                                    types.splice(types.indexOf("text"), 1);
                                    item.setAttribute("data-type", types.join(" "));
                                    newNodes.push(item);
                                }
                            } else {
                                newNodes.push(item);
                            }
                        } else {
                            newNodes.push(item);
                        }
                    }
                    if (removeText) {
                        newNodes.push(document.createTextNode(removeText));
                    }
                });
            }
        }

        if (this.range.startContainer.nodeType !== 3 && (this.range.startContainer as HTMLElement).tagName === "SPAN" &&
            this.range.startContainer.isSameNode(this.range.endContainer) && !isEndSpan) {
            // 切割元素
            const startContainer = this.range.startContainer as HTMLElement;
            const afterElement = document.createElement("span");
            const attributes = startContainer.attributes;
            for (let i = 0; i < attributes.length; i++) {
                afterElement.setAttribute(attributes[i].name, attributes[i].value);
            }
            this.range.setEnd(startContainer.lastChild, startContainer.lastChild.textContent.length);
            afterElement.append(this.range.extractContents());
            startContainer.after(afterElement);
            // https://github.com/siyuan-note/siyuan/issues/13871#issuecomment-2662855319
            const firstTypes = startContainer.getAttribute("data-type").split(" ");
            if (firstTypes.includes("code") || firstTypes.includes("tag") || firstTypes.includes("kbd")) {
                afterElement.insertAdjacentText("beforebegin", Constants.ZWSP + Constants.ZWSP);
                afterElement.insertAdjacentText("afterbegin", Constants.ZWSP);
                this.range.setStart(afterElement.previousSibling, 1);
            } else {
                this.range.setStartBefore(afterElement);
            }
            this.range.collapse(true);
        }
        for (let i = 0; i < newNodes.length; i++) {
            const currentNewNode = newNodes[i] as HTMLElement;
            const nextNewNode = newNodes[i + 1] as HTMLElement;
            const currentType = currentNewNode.nodeType !== 3 ? (currentNewNode.getAttribute("data-type") || "") : "";
            if (currentNewNode.nodeType !== 3 && nextNewNode && nextNewNode.nodeType !== 3 &&
                nextNewNode.tagName === currentNewNode.tagName &&
                // 表格内多个换行 https://github.com/siyuan-note/siyuan/issues/12300
                currentNewNode.tagName !== "BR" &&
                isArrayEqual((nextNewNode.getAttribute("data-type") || "").split(" "), currentType.split(" ")) &&
                currentNewNode.getAttribute("data-id") === nextNewNode.getAttribute("data-id") &&
                currentNewNode.getAttribute("data-subtype") === nextNewNode.getAttribute("data-subtype") &&
                currentNewNode.style.color === nextNewNode.style.color &&
                currentNewNode.style.webkitTextFillColor === nextNewNode.style.webkitTextFillColor &&
                currentNewNode.style.webkitTextStroke === nextNewNode.style.webkitTextStroke &&
                currentNewNode.style.textShadow === nextNewNode.style.textShadow &&
                currentNewNode.style.fontSize === nextNewNode.style.fontSize &&
                currentNewNode.style.backgroundColor === nextNewNode.style.backgroundColor) {
                // 合并相同的 node
                if (currentType.indexOf("inline-math") > -1) {
                    // 数学公式合并 data-content https://github.com/siyuan-note/siyuan/issues/6028
                    nextNewNode.setAttribute("data-content", currentNewNode.getAttribute("data-content") + nextNewNode.getAttribute("data-content"));
                } else {
                    // 测试不存在 https://ld246.com/article/1664454663564 情况，故移除引用合并限制
                    // 搜索结果引用被高亮隔断需进行合并 https://github.com/siyuan-note/siyuan/issues/7588
                    nextNewNode.innerHTML = currentNewNode.innerHTML + nextNewNode.innerHTML;
                    // 如果为备注时，合并备注内容
                    if (currentType.indexOf("inline-memo") > -1) {
                        nextNewNode.setAttribute("data-inline-memo-content", (currentNewNode.getAttribute("data-inline-memo-content") || "") +
                            (nextNewNode.getAttribute("data-inline-memo-content") || ""));
                    }
                }
                newNodes.splice(i, 1);
                i--;
            } else {
                this.range.insertNode(currentNewNode);
                if (currentNewNode.nodeType === 1 && ["code", "tag", "kbd"].includes(type)) {
                    // 添加为 span https://github.com/siyuan-note/siyuan/issues/6155
                    const currentPreviousSibling = hasPreviousSibling(currentNewNode);
                    if (!currentPreviousSibling || currentPreviousSibling.textContent.endsWith("\n")) {
                        currentNewNode.before(document.createTextNode(Constants.ZWSP));
                    }
                    if (!currentNewNode.textContent.startsWith(Constants.ZWSP)) {
                        currentNewNode.textContent = Constants.ZWSP + currentNewNode.textContent;
                    }
                    const currentNextSibling = hasNextSibling(currentNewNode);
                    if (!currentNextSibling ||
                        (currentNextSibling && (
                                currentNextSibling.nodeType !== 3 ||
                                (currentNextSibling.nodeType === 3 && !currentNextSibling.textContent.startsWith(Constants.ZWSP)))
                        )
                    ) {
                        currentNewNode.after(document.createTextNode(Constants.ZWSP));
                    }
                } else if (currentNewNode.nodeType === 3 && ["code", "tag", "kbd", "clear"].includes(type)) {
                    let currentPreviousSibling = hasPreviousSibling(currentNewNode) as HTMLElement;
                    let previousIsCTK = false;
                    let currentPreviousSiblingTypes: string[];
                    if (currentPreviousSibling) {
                        if (currentPreviousSibling.nodeType === 1) {
                            currentPreviousSiblingTypes = currentPreviousSibling.dataset.type.split(" ");
                            if (currentPreviousSiblingTypes.includes("code") || currentPreviousSiblingTypes.includes("tag") || currentPreviousSiblingTypes.includes("kbd")) {
                                previousIsCTK = true;
                            }
                        } else if (currentPreviousSibling.textContent.endsWith(Constants.ZWSP)) {
                            currentPreviousSibling.textContent = currentPreviousSibling.textContent.substring(0, currentPreviousSibling.textContent.length - 1);
                        }
                    }
                    let currentNextSibling = hasNextSibling(currentNewNode) as HTMLElement;
                    let nextIsCTK = false;
                    let currentNextSiblingTypes: string[];
                    if (currentNextSibling) {
                        if (currentNextSibling.nodeType === 1) {
                            currentNextSiblingTypes = currentNextSibling.dataset.type.split(" ");
                            if (currentNextSiblingTypes.includes("code") || currentNextSiblingTypes.includes("tag") || currentNextSiblingTypes.includes("kbd")) {
                                nextIsCTK = true;
                            }
                        } else if (currentNextSibling.textContent.startsWith(Constants.ZWSP) &&
                            (!previousIsCTK || previousIsCTK && currentPreviousSibling.textContent === Constants.ZWSP)) {
                            currentNextSibling.textContent = currentNextSibling.textContent.substring(1);
                        }
                    }
                    if (currentNewNode) {
                        if (previousIsCTK) {
                            if (!currentNewNode.textContent.startsWith(Constants.ZWSP)) {
                                currentNewNode.textContent = Constants.ZWSP + currentNewNode.textContent;
                            } else if (nextIsCTK && isArrayEqual(currentNextSiblingTypes, currentPreviousSiblingTypes) &&
                                hasSameTextStyle(currentNextSibling, currentPreviousSibling, textObj)) {
                                // 行内元素设置第一条第二个操作 https://github.com/siyuan-note/siyuan/issues/14290
                                newNodes.splice(i, 1);
                                i--;
                                currentNewNode.remove();
                                previousIndex = currentPreviousSibling.innerHTML.length;
                                nextElement = previousElement;
                                nextIndex = currentPreviousSibling.innerHTML.length + nextIndex;
                                currentPreviousSibling.innerHTML = currentPreviousSibling.innerHTML + currentNextSibling.innerHTML.replace(Constants.ZWSP, "");
                                currentNextSibling.remove();
                            }
                        } else if (currentNewNode.textContent.startsWith(Constants.ZWSP)) {
                            currentPreviousSibling = hasPreviousSibling(currentNewNode) as HTMLElement;
                            if (currentPreviousSibling.nodeType === 1) {
                                const currentPreviousSiblingTypes = currentPreviousSibling.dataset.type.split(" ");
                                if (!currentPreviousSiblingTypes.includes("code") && !currentPreviousSiblingTypes.includes("tag") && !currentPreviousSiblingTypes.includes("kbd")) {
                                    currentNewNode.textContent = currentNewNode.textContent.substring(1);
                                }
                            } else {
                                currentNewNode.textContent = currentNewNode.textContent.substring(1);
                            }
                        }
                        if (nextIsCTK) {
                            if (!currentNextSibling.textContent.startsWith(Constants.ZWSP)) {
                                currentNextSibling.textContent = Constants.ZWSP + currentNextSibling.textContent;
                            }
                        } else if (currentNewNode.textContent.endsWith(Constants.ZWSP)) {
                            currentNextSibling = hasNextSibling(currentNewNode) as HTMLElement;
                            if (currentNextSibling.nodeType === 1) {
                                const currentNextSiblingTypes = currentNextSibling.dataset.type.split(" ");
                                if (!currentNextSiblingTypes.includes("code") && !currentNextSiblingTypes.includes("tag") && !currentNextSiblingTypes.includes("kbd")) {
                                    currentNewNode.textContent = currentNewNode.textContent.substring(0, currentNewNode.textContent.length - 1);
                                }
                            } else {
                                currentNewNode.textContent = currentNewNode.textContent.substring(0, currentNewNode.textContent.length - 1);
                            }
                        }
                    }
                }
                this.range.collapse(false);
            }
        }
        if (previousElement) {
            if (previousElement.nodeType !== 3 && previousElement.textContent === Constants.ZWSP) {
                // https://github.com/siyuan-note/siyuan/issues/7548
                previousElement.remove();
            } else {
                this.mergeNode(previousElement.childNodes);
            }
        }
        if (nextElement) {
            this.mergeNode(nextElement.childNodes);
        }
        if (typeof previousIndex === "number") {
            this.range.setStart(previousElement.firstChild, previousIndex);
        } else if (newNodes.length > 0) {
            if (newNodes[0].nodeType !== 3 && (newNodes[0] as HTMLElement).getAttribute("data-type") === "inline-math") {
                // 数学公式后面处理
            } else {
                if (newNodes[0].firstChild) {
                    if (newNodes[0].firstChild.textContent === Constants.ZWSP) {
                        // 新建元素时光标消失 https://github.com/siyuan-note/siyuan/issues/6481
                        // 新建元素粘贴后元素消失 https://ld246.com/article/1665556907936
                        this.range.setStart(newNodes[0].firstChild, 1);
                    } else {
                        this.range.setStart(newNodes[0].firstChild, 0);
                    }
                } else if (newNodes[0].nodeType === 3) {
                    this.range.setStart(newNodes[0], 0);
                } else {
                    this.range.setStartBefore(newNodes[0]);
                }
            }
        } else if (nextElement) {
            // aaa**bbb** 选中 aaa 加粗
            this.range.setStart(nextElement.firstChild, 0);
        }
        if (typeof nextIndex === "number") {
            this.range.setEnd(nextElement.lastChild, nextIndex);
        } else if (newNodes.length > 0) {
            const lastNewNode = newNodes[newNodes.length - 1];
            if (lastNewNode.nodeType !== 3 && (lastNewNode as HTMLElement).getAttribute("data-type").indexOf("inline-math") > -1) {
                const mathPreviousSibling = hasPreviousSibling(lastNewNode);
                if (mathPreviousSibling && mathPreviousSibling.nodeType === 3) {
                    this.range.setStart(mathPreviousSibling, mathPreviousSibling.textContent.length);
                } else {
                    this.range.setStartBefore(lastNewNode);
                }
                const mathNextSibling = hasNextSibling(lastNewNode);
                if (mathNextSibling && mathNextSibling.nodeType === 3) { // https://github.com/siyuan-note/siyuan/issues/6065
                    this.range.setEnd(mathNextSibling, 0);
                } else {
                    this.range.setEndAfter(lastNewNode);
                }
            } else {
                if (lastNewNode.lastChild) {
                    if (lastNewNode.lastChild.textContent === Constants.ZWSP) {
                        // 新建元素时光标消失 https://github.com/siyuan-note/siyuan/issues/6481
                        // 新建元素粘贴后元素消失 https://ld246.com/article/1665556907936
                        this.range.collapse(true);
                    } else {
                        this.range.setEnd(lastNewNode.lastChild, lastNewNode.lastChild.textContent.length);
                    }
                } else if (lastNewNode.nodeType === 3) {
                    this.range.setEnd(lastNewNode, lastNewNode.textContent.length);
                    if (lastNewNode.textContent === Constants.ZWSP) {
                        // 粗体后取消粗体光标不存在 https://github.com/siyuan-note/insider/issues/1056
                        this.range.collapse(false);
                    }
                } else {
                    // eg: 表格中有3行时，选中第二行三级，多次加粗会增加换行
                    this.range.setEndAfter(lastNewNode);
                }
            }
        } else if (previousElement) {
            // **aaa**bbb 选中 bbb 加粗
            // 需进行 mergeNode ，否用 alt+x 为相同颜色 aaabbb 中的 bbb 再次赋值后无法选中
            this.range.setEnd(previousElement.firstChild, previousElement.firstChild.textContent.length);
        }
        let needFocus = true;
        if (type === "inline-math") {
            mathRender(nodeElement);
            if (selectText === "") {
                protyle.toolbar.showRender(protyle, newNodes[0] as HTMLElement, undefined, html);
                return;
            }
        } else if (type === "inline-memo") {
            protyle.toolbar.showRender(protyle, newNodes[0] as HTMLElement, newNodes as Element[], html);
            return;
        } else if (type === "block-ref") {
            this.range.collapse(false);
        } else if (type === "a") {
            const aElement = newNodes[0] as HTMLElement;
            if (aElement.textContent.replace(Constants.ZWSP, "") === "" || !aElement.getAttribute("data-href")) {
                needFocus = false;
                linkMenu(protyle, aElement, aElement.getAttribute("data-href") ? true : false);
            } else {
                this.range.collapse(false);
            }
        }
        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
        updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, html);
        const wbrElement = nodeElement.querySelector("wbr");
        if (wbrElement) {
            wbrElement.remove();
        }
        if (needFocus) {
            focusByRange(this.range);
        }
    }

    public showRender(protyle: IProtyle, renderElement: Element, updateElements?: Element[], oldHTML?: string) {
        const nodeElement = hasClosestBlock(renderElement);
        if (!nodeElement) {
            return;
        }
        hideElements(["hint"], protyle);
        window.siyuan.menus.menu.remove();
        const id = nodeElement.getAttribute("data-node-id");
        const types = (renderElement.getAttribute("data-type") || "").split(" ");
        const html = oldHTML || nodeElement.outerHTML;
        let title = "HTML";
        let placeholder = "";
        const isInlineMemo = types.includes("inline-memo");
        switch (renderElement.getAttribute("data-subtype")) {
            case "abc":
                title = window.siyuan.languages.staff;
                break;
            case "echarts":
                title = window.siyuan.languages.chart;
                break;
            case "flowchart":
                title = "Flow Chart";
                break;
            case "graphviz":
                title = "Graphviz";
                break;
            case "mermaid":
                title = "Mermaid";
                break;
            case "mindmap":
                placeholder = `- foo
  - bar
- baz`;
                title = window.siyuan.languages.mindmap;
                break;
            case "plantuml":
                title = "UML";
                break;
            case "math":
                if (types.includes("NodeMathBlock")) {
                    title = window.siyuan.languages.math;
                } else {
                    title = window.siyuan.languages["inline-math"];
                }
                break;
        }
        if (types.includes("NodeBlockQueryEmbed")) {
            title = window.siyuan.languages.blockEmbed;
        } else if (isInlineMemo) {
            title = window.siyuan.languages.memo;
        }
        const isPin = this.subElement.querySelector('[data-type="pin"]')?.getAttribute("aria-label") === window.siyuan.languages.unpin;
        const pinData: IObject = {};
        if (isPin) {
            const textElement = this.subElement.querySelector(".b3-text-field") as HTMLTextAreaElement;
            pinData.styleH = textElement.style.height;
            pinData.styleW = textElement.style.width;
        } else {
            this.subElement.style.width = "";
            this.subElement.style.padding = "0";
        }
        this.subElement.innerHTML = `<div ${(isPin && this.subElement.firstElementChild.getAttribute("data-drag") === "true") ? 'data-drag="true"' : ""}><div class="block__icons block__icons--menu fn__flex" style="border-radius: var(--b3-border-radius-b) var(--b3-border-radius-b) 0 0;">
    <span class="fn__flex-1 resize__move">
        ${title}
    </span>
    <span class="fn__space"></span>
    <button data-type="refresh" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${(isPin && !this.subElement.querySelector('[data-type="refresh"]').classList.contains("block__icon--active")) ? "" : " block__icon--active"}${types.includes("NodeBlockQueryEmbed") ? " fn__none" : ""}" aria-label="${window.siyuan.languages.refresh}"><svg><use xlink:href="#iconRefresh"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="before" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${protyle.disabled ? " fn__none" : ""}" aria-label="${window.siyuan.languages["insert-before"]}"><svg><use xlink:href="#iconBefore"></use></svg></button>
    <span class="fn__space${protyle.disabled ? " fn__none" : ""}"></span>
    <button data-type="after" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw${protyle.disabled ? " fn__none" : ""}" aria-label="${window.siyuan.languages["insert-after"]}"><svg><use xlink:href="#iconAfter"></use></svg></button>
    <span class="fn__space${protyle.disabled ? " fn__none" : ""}"></span>
    <button data-type="export" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${window.siyuan.languages.export} ${window.siyuan.languages.image}"><svg><use xlink:href="#iconImage"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="pin" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${isPin ? window.siyuan.languages.unpin : window.siyuan.languages.pin}"><svg><use xlink:href="#icon${isPin ? "Unpin" : "Pin"}"></use></svg></button>
    <span class="fn__space"></span>
    <button data-type="close" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="${window.siyuan.languages.close}"><svg style="width: 10px;margin: 0 2px;"><use xlink:href="#iconClose"></use></svg></button>
</div>
<textarea ${protyle.disabled ? " readonly" : ""} spellcheck="false" class="b3-text-field b3-text-field--text fn__block" placeholder="${placeholder}" style="${isMobile() ? "" : "width:" + Math.max(480, renderElement.clientWidth * 0.7) + "px"};max-height:calc(80vh - 44px);min-height: 48px;min-width: 268px;border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b);font-family: var(--b3-font-family-code);"></textarea></div>`;
        const autoHeight = () => {
            textElement.style.height = textElement.scrollHeight + "px";
            if (isMobile()) {
                setPosition(this.subElement, 0, 0);
                return;
            }
            if (this.subElement.firstElementChild.getAttribute("data-drag") === "true") {
                if (textElement.getBoundingClientRect().bottom > window.innerHeight) {
                    this.subElement.style.top = window.innerHeight - this.subElement.clientHeight + "px";
                }
                return;
            }
            const bottom = nodeRect.bottom === nodeRect.top ? nodeRect.bottom + 26 : nodeRect.bottom;
            if (this.subElement.clientHeight <= window.innerHeight - bottom || this.subElement.clientHeight <= nodeRect.top) {
                if (types.includes("inline-math") || isInlineMemo) {
                    setPosition(this.subElement, nodeRect.left, bottom, nodeRect.height || 26);
                } else {
                    setPosition(this.subElement, nodeRect.left + (nodeRect.width - this.subElement.clientWidth) / 2, bottom, nodeRect.height || 26);
                }
            } else {
                setPosition(this.subElement, nodeRect.right, bottom);
            }
        };
        const headerElement = this.subElement.querySelector(".block__icons");
        headerElement.addEventListener("click", (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const btnElement = hasClosestByClassName(target, "b3-tooltips");
            if (!btnElement) {
                if (event.detail === 2) {
                    const pingElement = headerElement.querySelector('[data-type="pin"]');
                    if (pingElement.getAttribute("aria-label") === window.siyuan.languages.unpin) {
                        pingElement.querySelector("svg use").setAttribute("xlink:href", "#iconPin");
                        pingElement.setAttribute("aria-label", window.siyuan.languages.pin);
                    } else {
                        pingElement.querySelector("svg use").setAttribute("xlink:href", "#iconUnpin");
                        pingElement.setAttribute("aria-label", window.siyuan.languages.unpin);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }
            event.stopPropagation();
            switch (btnElement.getAttribute("data-type")) {
                case "close":
                    this.subElement.querySelector('[data-type="pin"]').setAttribute("aria-label", window.siyuan.languages.pin);
                    hideElements(["util"], protyle);
                    break;
                case "pin":
                    if (btnElement.getAttribute("aria-label") === window.siyuan.languages.unpin) {
                        btnElement.querySelector("svg use").setAttribute("xlink:href", "#iconPin");
                        btnElement.setAttribute("aria-label", window.siyuan.languages.pin);
                    } else {
                        btnElement.querySelector("svg use").setAttribute("xlink:href", "#iconUnpin");
                        btnElement.setAttribute("aria-label", window.siyuan.languages.unpin);
                    }
                    break;
                case "refresh":
                    btnElement.classList.toggle("block__icon--active");
                    break;
                case "before":
                    insertEmptyBlock(protyle, "beforebegin", id);
                    hideElements(["util"], protyle);
                    break;
                case "after":
                    insertEmptyBlock(protyle, "afterend", id);
                    hideElements(["util"], protyle);
                    break;
                case "export":
                    exportImg();
                    break;
            }
        });
        const exportImg = () => {
            const msgId = showMessage(window.siyuan.languages.exporting, 0);
            if (renderElement.getAttribute("data-subtype") === "plantuml") {
                fetch(renderElement.querySelector("img").getAttribute("src")).then(function (response) {
                    return response.blob();
                }).then(function (blob) {
                    const formData = new FormData();
                    formData.append("file", blob);
                    formData.append("type", "image/png");
                    fetchPost("/api/export/exportAsFile", formData, (response) => {
                        openByMobile(response.data.file);
                        hideMessage(msgId);
                    });
                });
                return;
            }
            setTimeout(() => {
                addScript("/stage/protyle/js/html-to-image.min.js?v=1.11.13", "protyleHtml2image").then(() => {
                    window.htmlToImage.toCanvas(renderElement).then((canvas) => {
                        canvas.toBlob((blob: Blob) => {
                            const formData = new FormData();
                            formData.append("file", blob);
                            formData.append("type", "image/png");
                            fetchPost("/api/export/exportAsFile", formData, (response) => {
                                openByMobile(response.data.file);
                                hideMessage(msgId);
                            });
                        });
                    });
                });
            }, Constants.TIMEOUT_LOAD);
        };
        const textElement = this.subElement.querySelector(".b3-text-field") as HTMLTextAreaElement;
        if (types.includes("NodeHTMLBlock")) {
            textElement.value = Lute.UnEscapeHTMLStr(renderElement.querySelector("protyle-html").getAttribute("data-content") || "");
        } else if (isInlineMemo) {
            textElement.value = Lute.UnEscapeHTMLStr(renderElement.getAttribute("data-inline-memo-content") || "");
        } else {
            textElement.value = Lute.UnEscapeHTMLStr(renderElement.getAttribute("data-content") || "");
        }

        textElement.addEventListener("input", (event) => {
            if (!renderElement.parentElement) {
                return;
            }
            if (textElement.clientHeight !== textElement.scrollHeight) {
                autoHeight();
            }
            if (!this.subElement.querySelector('[data-type="refresh"]').classList.contains("block__icon--active")) {
                return;
            }
            if (types.includes("NodeHTMLBlock")) {
                renderElement.querySelector("protyle-html").setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
            } else if (isInlineMemo) {
                let inlineMemoElements;
                if (updateElements) {
                    inlineMemoElements = updateElements;
                } else {
                    inlineMemoElements = [renderElement];
                }
                inlineMemoElements.forEach((item) => {
                    item.setAttribute("data-inline-memo-content", Lute.EscapeHTMLStr(textElement.value));
                });
            } else {
                renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
                renderElement.removeAttribute("data-render");
            }
            if (!types.includes("NodeBlockQueryEmbed") || !types.includes("NodeHTMLBlock") || !isInlineMemo) {
                processRender(renderElement);
            }
            event.stopPropagation();
        });
        textElement.addEventListener("keydown", (event: KeyboardEvent) => {
            event.stopPropagation();
            // 阻止 ctrl+m 缩小窗口 https://github.com/siyuan-note/siyuan/issues/5541
            if (matchHotKey(window.siyuan.config.keymap.editor.insert["inline-math"].custom, event)) {
                event.preventDefault();
                return;
            }
            if (event.isComposing) {
                return;
            }
            if (event.key === "Escape" || matchHotKey("⌘↩", event)) {
                this.subElement.querySelector('[data-type="pin"]').setAttribute("aria-label", window.siyuan.languages.pin);
                hideElements(["util"], protyle);
            } else if (event.key === "Tab") {
                // https://github.com/siyuan-note/siyuan/issues/5270
                document.execCommand("insertText", false, "\t");
                event.preventDefault();
            } else if (electronUndo(event)) {
                return;
            }
        });
        this.subElementCloseCB = () => {
            if (!renderElement.parentElement || protyle.disabled) {
                return;
            }
            let inlineLastNode: Element;
            if (types.includes("NodeHTMLBlock")) {
                let htmlText = textElement.value;
                if (htmlText) {
                    // 需移除首尾的空白字符与连续的换行 (空行) https://github.com/siyuan-note/siyuan/issues/7921
                    htmlText = htmlText.trim().replace(/\n+/g, "\n");
                    // 需一对 div 标签包裹，否则行内元素会解析错误 https://github.com/siyuan-note/siyuan/issues/6764
                    if (!(htmlText.startsWith("<div>") && htmlText.endsWith("</div>"))) {
                        htmlText = `<div>\n${htmlText}\n</div>`;
                    }
                }
                renderElement.querySelector("protyle-html").setAttribute("data-content", Lute.EscapeHTMLStr(htmlText));
            } else if (isInlineMemo) {
                let inlineMemoElements;
                if (updateElements) {
                    inlineMemoElements = updateElements;
                } else {
                    inlineMemoElements = [renderElement];
                }
                inlineMemoElements.forEach((item, index) => {
                    if (!textElement.value) {
                        // https://github.com/siyuan-note/insider/issues/1046
                        const currentTypes = item.getAttribute("data-type").split(" ");
                        if (currentTypes.length === 1 && currentTypes[0] === "inline-memo") {
                            item.outerHTML = item.innerHTML + (index === inlineMemoElements.length - 1 ? "<wbr>" : "");
                        } else {
                            currentTypes.find((typeItem, index) => {
                                if (typeItem === "inline-memo") {
                                    currentTypes.splice(index, 1);
                                    return true;
                                }
                            });
                            item.setAttribute("data-type", currentTypes.join(" "));
                            item.removeAttribute("data-inline-memo-content");
                        }
                        if (index === inlineMemoElements.length - 1) {
                            inlineLastNode = item;
                        }
                    } else {
                        // 行级备注自动移除换行  https://ld246.com/article/1664205917326
                        item.setAttribute("data-inline-memo-content", Lute.EscapeHTMLStr(textElement.value));
                    }
                });
            } else if (types.includes("inline-math")) {
                // 行内数学公式不允许换行 https://github.com/siyuan-note/siyuan/issues/2187
                if (textElement.value) {
                    renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
                    renderElement.removeAttribute("data-render");
                    processRender(renderElement);
                } else {
                    inlineLastNode = renderElement;
                    // esc 后需要 focus range，但点击空白处不能 focus range，否则光标无法留在点击位置
                    renderElement.outerHTML = "<wbr>";
                }
            } else {
                renderElement.setAttribute("data-content", Lute.EscapeHTMLStr(textElement.value));
                renderElement.removeAttribute("data-render");
                if (types.includes("NodeBlockQueryEmbed")) {
                    blockRender(protyle, renderElement);
                } else {
                    processRender(renderElement);
                }
            }

            // 光标定位
            if (getSelection().rangeCount === 0 ||
                // $$ 中间输入后再 ESC 光标无法定位
                (getSelection().rangeCount > 0 && hasClosestByClassName(getSelection().getRangeAt(0).startContainer, "protyle-util"))
            ) {  // https://ld246.com/article/1665306093005
                if (renderElement.tagName === "SPAN") {
                    if (inlineLastNode) {
                        if (inlineLastNode.parentElement) {
                            this.range.setStartAfter(inlineLastNode);
                            this.range.collapse(true);
                            focusByRange(this.range);
                        } else {
                            focusByWbr(nodeElement, this.range);
                        }
                    } else if (renderElement.parentElement) {
                        this.range.setStartAfter(renderElement);
                        this.range.collapse(true);
                        focusByRange(this.range);
                    }
                } else {
                    focusBlock(renderElement);
                    renderElement.classList.add("protyle-wysiwyg--select");
                }
            } else {
                // ctrl+M 后点击空白会留下 wbr
                nodeElement.querySelector("wbr")?.remove();
            }

            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            // HTML 块中包含多个 <pre> 时只能保存第一个 https://github.com/siyuan-note/siyuan/issues/5732
            if (types.includes("NodeHTMLBlock")) {
                const tempElement = document.createElement("template");
                tempElement.innerHTML = protyle.lute.SpinBlockDOM(nodeElement.outerHTML);
                if (tempElement.content.childElementCount > 1) {
                    showMessage(window.siyuan.languages.htmlBlockTip);
                }
            }
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
        };
        this.subElement.style.zIndex = (++window.siyuan.zIndex).toString();
        this.subElement.classList.remove("fn__none");
        const nodeRect = renderElement.getBoundingClientRect();
        this.element.classList.add("fn__none");
        if (isPin) {
            textElement.style.width = pinData.styleW;
            textElement.style.height = pinData.styleH;
        } else {
            autoHeight();
        }
        if (!protyle.disabled) {
            textElement.select();
        }
        protyle.app.plugins.forEach(item => {
            item.eventBus.emit("open-noneditableblock", {
                protyle,
                toolbar: this,
                blockElement: nodeElement,
                renderElement,
            });
        });
    }

    public showCodeLanguage(protyle: IProtyle, languageElement: HTMLElement) {
        const nodeElement = hasClosestBlock(languageElement);
        if (!nodeElement) {
            return;
        }
        hideElements(["hint"], protyle);
        window.siyuan.menus.menu.remove();
        this.range = getEditorRange(nodeElement);
        const id = nodeElement.getAttribute("data-node-id");
        let oldHtml = nodeElement.outerHTML;

        let html = `<div class="b3-list-item">${window.siyuan.languages.clear}</div>`;
        const hljsLanguages = Constants.ALIAS_CODE_LANGUAGES.concat(window.hljs?.listLanguages() ?? []).sort();
        hljsLanguages.forEach((item, index) => {
            html += `<div class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">${item}</div>`;
        });

        this.subElement.style.width = "";
        this.subElement.style.padding = "";
        this.subElement.innerHTML = `<div class="fn__flex-column" style="max-height:50vh">
    <input placeholder="${window.siyuan.languages.search}" style="margin: 0 8px 4px 8px" class="b3-text-field"/>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative">${html}</div>
</div>`;

        const listElement = this.subElement.lastElementChild.lastElementChild as HTMLElement;
        const inputElement = this.subElement.querySelector("input");
        inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
            event.stopPropagation();
            if (event.isComposing) {
                return;
            }
            upDownHint(listElement, event);
            if (event.key === "Enter") {
                oldHtml = this.updateLanguage(languageElement, protyle, id, nodeElement, oldHtml, this.subElement.querySelector(".b3-list-item--focus").textContent);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key === "Escape") {
                this.subElement.classList.add("fn__none");
                focusByRange(this.range);
            }
        });
        inputElement.addEventListener("input", (event) => {
            const lowerCaseValue = inputElement.value.toLowerCase();
            const matchLanguages = hljsLanguages.filter(item => item.includes(lowerCaseValue));
            let html = "";
            // sort
            let matchInput = false;
            matchLanguages.sort((a, b) => {
                if (a.startsWith(lowerCaseValue) && b.startsWith(lowerCaseValue)) {
                    if (a.length < b.length) {
                        return -1;
                    } else if (a.length === b.length) {
                        return 0;
                    } else {
                        return 1;
                    }
                } else if (a.startsWith(lowerCaseValue)) {
                    return -1;
                } else if (b.startsWith(lowerCaseValue)) {
                    return 1;
                } else {
                    return 0;
                }
            }).forEach((item) => {
                if (inputElement.value === item) {
                    matchInput = true;
                }
                html += `<div class="b3-list-item">${item.replace(lowerCaseValue, "<b>" + lowerCaseValue + "</b>")}</div>`;
            });
            if (inputElement.value.trim() && !matchInput) {
                html = `<div class="b3-list-item"><b>${escapeHtml(inputElement.value.replace(/`| /g, "_"))}</b></div>${html}`;
            }
            html = `<div class="b3-list-item">${window.siyuan.languages.clear}</div>` + html;
            listElement.innerHTML = html;
            if (listElement.firstElementChild.nextElementSibling) {
                listElement.firstElementChild.nextElementSibling.classList.add("b3-list-item--focus");
            } else {
                listElement.firstElementChild.classList.add("b3-list-item--focus");
            }
            event.stopPropagation();
        });
        listElement.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const listElement = hasClosestByClassName(target, "b3-list-item");
            if (!listElement) {
                return;
            }
            oldHtml = this.updateLanguage(languageElement, protyle, id, nodeElement, oldHtml, listElement.textContent);
        });
        this.subElement.style.zIndex = (++window.siyuan.zIndex).toString();
        this.subElement.classList.remove("fn__none");
        this.subElementCloseCB = undefined;
        /// #if !MOBILE
        const nodeRect = languageElement.getBoundingClientRect();
        setPosition(this.subElement, nodeRect.left, nodeRect.bottom, nodeRect.height);
        /// #else
        setPosition(this.subElement, 0, 0);
        /// #endif
        this.element.classList.add("fn__none");
        inputElement.select();
    }

    public showTpl(protyle: IProtyle, nodeElement: HTMLElement, range: Range) {
        this.range = range;
        hideElements(["hint"], protyle);
        window.siyuan.menus.menu.remove();
        this.subElement.style.width = "";
        this.subElement.style.padding = "";
        this.subElement.innerHTML = `<div style="max-height:50vh" class="fn__flex">
<div class="fn__flex-column" style="${isMobile() ? "width: 100%" : "width: 256px"}">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
        <input class="b3-text-field fn__flex-1"/>
        <span class="fn__space"></span>
        <span data-type="previous" class="block__icon block__icon--show"><svg><use xlink:href="#iconLeft"></use></svg></span>
        <span class="fn__space"></span>
        <span data-type="next" class="block__icon block__icon--show"><svg><use xlink:href="#iconRight"></use></svg></span>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg"></div>
</div>
<div class="toolbarResize" style="    cursor: col-resize;
    box-shadow: 2px 0 0 0 var(--b3-theme-surface) inset, 3px 0 0 0 var(--b3-border-color) inset;
    width: 5px;
    margin-left: -2px;"></div>
<div style="width: 520px;${isMobile() || window.outerWidth < window.outerWidth / 2 + 520 ? "display:none;" : ""}overflow: auto;"></div>
</div>`;
        const listElement = this.subElement.querySelector(".b3-list");
        resizeSide(this.subElement.querySelector(".toolbarResize"), listElement.parentElement);
        const previewElement = this.subElement.firstElementChild.lastElementChild;
        let previewPath: string;
        listElement.addEventListener("mouseover", (event) => {
            const target = event.target as HTMLElement;
            const hoverItemElement = hasClosestByClassName(target, "b3-list-item");
            if (!hoverItemElement) {
                return;
            }
            const currentPath = hoverItemElement.getAttribute("data-value");
            if (previewPath === currentPath) {
                return;
            }
            previewPath = currentPath;
            previewTemplate(previewPath, previewElement, protyle.block.parentID);
            event.stopPropagation();
        });
        const inputElement = this.subElement.querySelector("input");
        inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
            event.stopPropagation();
            if (event.isComposing) {
                return;
            }
            const isEmpty = !this.subElement.querySelector(".b3-list-item");
            if (!isEmpty) {
                const currentElement = upDownHint(listElement, event);
                if (currentElement) {
                    const currentPath = currentElement.getAttribute("data-value");
                    if (previewPath === currentPath) {
                        return;
                    }
                    previewPath = currentPath;
                    previewTemplate(previewPath, previewElement, protyle.block.parentID);
                }
            }
            if (event.key === "Enter") {
                if (!isEmpty) {
                    hintRenderTemplate(decodeURIComponent(this.subElement.querySelector(".b3-list-item--focus").getAttribute("data-value")), protyle, nodeElement);
                } else {
                    focusByRange(this.range);
                }
                this.subElement.classList.add("fn__none");
                event.preventDefault();
            } else if (event.key === "Escape") {
                this.subElement.classList.add("fn__none");
                focusByRange(this.range);
            }
        });
        inputElement.addEventListener("input", (event) => {
            event.stopPropagation();
            fetchPost("/api/search/searchTemplate", {
                k: inputElement.value,
            }, (response) => {
                let searchHTML = "";
                response.data.blocks.forEach((item: { path: string, content: string }, index: number) => {
                    searchHTML += `<div data-value="${item.path}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">${item.content}</div>`;
                });
                listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
                const currentPath = response.data.blocks[0]?.path;
                if (previewPath === currentPath) {
                    return;
                }
                previewPath = currentPath;
                previewTemplate(previewPath, previewElement, protyle.block.parentID);
            });
        });
        this.subElement.lastElementChild.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains("b3-list--empty")) {
                this.subElement.classList.add("fn__none");
                focusByRange(this.range);
                event.stopPropagation();
                return;
            }
            const iconElement = hasClosestByClassName(target, "b3-list-item__action");
            /// #if !BROWSER
            if (iconElement && iconElement.getAttribute("data-type") === "open") {
                openBy(iconElement.parentElement.getAttribute("data-value"), "folder");
                event.stopPropagation();
                return;
            }
            /// #endif
            if (iconElement && iconElement.getAttribute("data-type") === "remove") {
                confirmDialog(window.siyuan.languages.remove, window.siyuan.languages.confirmDelete + "?", () => {
                    fetchPost("/api/search/removeTemplate", {path: iconElement.parentElement.getAttribute("data-value")}, () => {
                        if (iconElement.parentElement.parentElement.childElementCount === 1) {
                            iconElement.parentElement.parentElement.innerHTML = `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
                            previewTemplate("", previewElement, protyle.block.parentID);
                        } else {
                            if (iconElement.parentElement.classList.contains("b3-list-item--focus")) {
                                const sideElement = iconElement.parentElement.previousElementSibling || iconElement.parentElement.nextElementSibling;
                                sideElement.classList.add("b3-list-item--focus");
                                const currentPath = sideElement.getAttribute("data-value");
                                if (previewPath === currentPath) {
                                    return;
                                }
                                previewPath = currentPath;
                                previewTemplate(previewPath, previewElement, protyle.block.parentID);
                            }
                            iconElement.parentElement.remove();
                        }
                    });
                });
                event.stopPropagation();
                return;
            }
            const previousElement = hasClosestByAttribute(target, "data-type", "previous");
            if (previousElement) {
                inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp"}));
                event.stopPropagation();
                return;
            }
            const nextElement = hasClosestByAttribute(target, "data-type", "next");
            if (nextElement) {
                inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
                event.stopPropagation();
                return;
            }
            const listElement = hasClosestByClassName(target, "b3-list-item");
            if (listElement) {
                hintRenderTemplate(decodeURIComponent(listElement.getAttribute("data-value")), protyle, nodeElement);
                event.stopPropagation();
            }
        });
        this.subElement.style.zIndex = (++window.siyuan.zIndex).toString();
        this.subElement.classList.remove("fn__none");
        this.subElementCloseCB = undefined;
        this.element.classList.add("fn__none");
        inputElement.select();
        fetchPost("/api/search/searchTemplate", {
            k: "",
        }, (response) => {
            let html = "";
            response.data.blocks.forEach((item: { path: string, content: string }, index: number) => {
                html += `<div data-value="${item.path}" class="b3-list-item--hide-action b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">
<span class="b3-list-item__text">${item.content}</span>`;
                /// #if !BROWSER
                html += `<span data-type="open" class="b3-list-item__action b3-tooltips b3-tooltips__w" aria-label="${window.siyuan.languages.showInFolder}">
    <svg><use xlink:href="#iconFolder"></use></svg>
</span>`;
                /// #endif
                html += `<span data-type="remove" class="b3-list-item__action b3-tooltips b3-tooltips__w" aria-label="${window.siyuan.languages.remove}">
    <svg><use xlink:href="#iconTrashcan"></use></svg>
</span></div>`;
            });
            this.subElement.querySelector(".b3-list--background").innerHTML = html || `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
            /// #if !MOBILE
            const rangePosition = getSelectionPosition(nodeElement, range);
            setPosition(this.subElement, rangePosition.left, rangePosition.top + 18, Constants.SIZE_TOOLBAR_HEIGHT);
            (this.subElement.firstElementChild as HTMLElement).style.maxHeight = Math.min(window.innerHeight * 0.8, window.innerHeight - this.subElement.getBoundingClientRect().top) - 16 + "px";
            /// #else
            setPosition(this.subElement, 0, 0);
            /// #endif
            previewPath = listElement.firstElementChild.getAttribute("data-value");
            previewTemplate(previewPath, previewElement, protyle.block.parentID);
        });
    }

    public showWidget(protyle: IProtyle, nodeElement: HTMLElement, range: Range) {
        this.range = range;
        hideElements(["hint"], protyle);
        window.siyuan.menus.menu.remove();
        this.subElement.style.width = "";
        this.subElement.style.padding = "";
        this.subElement.innerHTML = `<div class="fn__flex-column" style="max-height:50vh">
    <input style="margin: 0 8px 4px 8px" class="b3-text-field"/>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height:64px" src="/stage/loading-pure.svg"></div>
</div>`;
        const listElement = this.subElement.lastElementChild.lastElementChild as HTMLElement;
        const inputElement = this.subElement.querySelector("input");
        inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
            event.stopPropagation();
            if (event.isComposing) {
                return;
            }
            upDownHint(listElement, event);
            if (event.key === "Enter") {
                hintRenderWidget(this.subElement.querySelector(".b3-list-item--focus").getAttribute("data-content"), protyle);
                this.subElement.classList.add("fn__none");
                event.preventDefault();
            } else if (event.key === "Escape") {
                this.subElement.classList.add("fn__none");
                focusByRange(this.range);
            }
        });
        inputElement.addEventListener("input", (event) => {
            event.stopPropagation();
            fetchPost("/api/search/searchWidget", {
                k: inputElement.value,
            }, (response) => {
                let searchHTML = "";
                response.data.blocks.forEach((item: { path: string, content: string, name: string }, index: number) => {
                    searchHTML += `<div data-value="${item.path}" data-content="${item.content}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">
    ${item.name}
    <span class="b3-list-item__meta">${item.content}</span>
</div>`;
                });
                listElement.innerHTML = searchHTML;
            });
        });
        this.subElement.lastElementChild.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const listElement = hasClosestByClassName(target, "b3-list-item");
            if (!listElement) {
                return;
            }
            hintRenderWidget(listElement.dataset.content, protyle);
        });
        this.subElement.style.zIndex = (++window.siyuan.zIndex).toString();
        this.subElement.classList.remove("fn__none");
        this.subElementCloseCB = undefined;
        this.element.classList.add("fn__none");
        inputElement.select();
        fetchPost("/api/search/searchWidget", {
            k: "",
        }, (response) => {
            let html = "";
            response.data.blocks.forEach((item: { content: string, name: string }, index: number) => {
                html += `<div class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" data-content="${item.content}">
${item.name}
<span class="b3-list-item__meta">${item.content}</span>
</div>`;
            });
            this.subElement.querySelector(".b3-list--background").innerHTML = html;
            /// #if !MOBILE
            const rangePosition = getSelectionPosition(nodeElement, range);
            setPosition(this.subElement, rangePosition.left, rangePosition.top + 18, Constants.SIZE_TOOLBAR_HEIGHT);
            /// #else
            setPosition(this.subElement, 0, 0);
            /// #endif
        });
    }

    public showContent(protyle: IProtyle, range: Range, nodeElement: Element) {
        this.range = range;
        hideElements(["hint"], protyle);

        this.subElement.style.width = "auto";
        this.subElement.style.padding = "0 8px";
        let html = "";
        const hasCopy = range.toString() !== "" || (range.cloneContents().childNodes[0] as HTMLElement)?.classList?.contains("emoji");
        if (hasCopy) {
            html += "<button class=\"keyboard__action\" data-action=\"copy\"><svg><use xlink:href=\"#iconCopy\"></use></svg></button>";
            if (!protyle.disabled) {
                html += `<button class="keyboard__action" data-action="cut"><svg><use xlink:href="#iconCut"></use></svg></button>
<button class="keyboard__action" data-action="delete"><svg><use xlink:href="#iconTrashcan"></use></svg></button>`;
            }
        }
        if (!protyle.disabled) {
            html += `<button class="keyboard__action" data-action="paste"><svg><use xlink:href="#iconPaste"></use></svg></button>
<button class="keyboard__action" data-action="select"><svg><use xlink:href="#iconSelect"></use></svg></button>`;
        }
        if (hasCopy || !protyle.disabled) {
            html += "<button class=\"keyboard__action\" data-action=\"more\"><svg><use xlink:href=\"#iconMore\"></use></svg></button>";
        }
        this.subElement.innerHTML = `<div class="fn__flex">${html}</div>`;
        this.subElement.lastElementChild.addEventListener("click", async (event) => {
            const btnElemen = hasClosestByClassName(event.target as HTMLElement, "keyboard__action");
            if (!btnElemen) {
                return;
            }
            const action = btnElemen.getAttribute("data-action");
            if (action === "copy") {
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("copy");
                this.subElement.classList.add("fn__none");
            } else if (action === "cut") {
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("cut");
                this.subElement.classList.add("fn__none");
            } else if (action === "delete") {
                const currentRange = getEditorRange(nodeElement);
                currentRange.insertNode(document.createElement("wbr"));
                const oldHTML = nodeElement.outerHTML;
                currentRange.extractContents();
                focusByWbr(nodeElement, currentRange);
                focusByRange(currentRange);
                updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                this.subElement.classList.add("fn__none");
            } else if (action === "paste") {
                if (document.queryCommandSupported("paste")) {
                    document.execCommand("paste");
                } else {
                    try {
                        const text = await readClipboard();
                        paste(protyle, Object.assign(text, {target: nodeElement as HTMLElement}));
                    } catch (e) {
                        console.log(e);
                    }
                }
                this.subElement.classList.add("fn__none");
            } else if (action === "select") {
                selectAll(protyle, nodeElement, range);
                this.subElement.classList.add("fn__none");
            } else if (action === "copyPlainText") {
                focusByRange(getEditorRange(nodeElement));
                copyPlainText(getSelection().getRangeAt(0).toString());
                this.subElement.classList.add("fn__none");
            } else if (action === "pasteAsPlainText") {
                focusByRange(getEditorRange(nodeElement));
                pasteAsPlainText(protyle);
                this.subElement.classList.add("fn__none");
            } else if (action === "pasteEscaped") {
                pasteEscaped(protyle, nodeElement);
                this.subElement.classList.add("fn__none");
            } else if (action === "back") {
                this.subElement.lastElementChild.innerHTML = html;
            } else if (action === "more") {
                this.subElement.lastElementChild.innerHTML = `<button class="keyboard__action${hasCopy ? "" : " fn__none"}" data-action="copyPlainText"><span>${window.siyuan.languages.copyPlainText}</span></button>
<div class="keyboard__split${hasCopy ? "" : " fn__none"}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteAsPlainText"><span>${window.siyuan.languages.pasteAsPlainText}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action${protyle.disabled ? " fn__none" : ""}" data-action="pasteEscaped"><span>${window.siyuan.languages.pasteEscaped}</span></button>
<div class="keyboard__split${protyle.disabled ? " fn__none" : ""}"></div>
<button class="keyboard__action" data-action="back"><svg><use xlink:href="#iconBack"></use></svg></button>`;
                setPosition(this.subElement, rangePosition.left, rangePosition.top + 28, Constants.SIZE_TOOLBAR_HEIGHT);
            }
        });
        this.subElement.style.zIndex = (++window.siyuan.zIndex).toString();
        this.subElement.classList.remove("fn__none");
        this.subElementCloseCB = undefined;
        this.element.classList.add("fn__none");
        const rangePosition = getSelectionPosition(nodeElement, range);
        setPosition(this.subElement, rangePosition.left, rangePosition.top - 48, Constants.SIZE_TOOLBAR_HEIGHT);
    }

    private genItem(protyle: IProtyle, menuItem: IMenuItem) {
        let menuItemObj;
        switch (menuItem.name) {
            case "strong":
            case "em":
            case "s":
            case "code":
            case "mark":
            case "tag":
            case "u":
            case "sup":
            case "clear":
            case "sub":
            case "kbd":
                menuItemObj = new ToolbarItem(protyle, menuItem);
                break;
            case "block-ref":
                menuItemObj = new BlockRef(protyle, menuItem);
                break;
            case "inline-math":
                menuItemObj = new InlineMath(protyle, menuItem);
                break;
            case "inline-memo":
                menuItemObj = new InlineMemo(protyle, menuItem);
                break;
            case "|":
                menuItemObj = new Divider();
                break;
            case "text":
                menuItemObj = new Font(protyle, menuItem);
                break;
            case "a":
                menuItemObj = new Link(protyle, menuItem);
                break;
            default:
                menuItemObj = new ToolbarItem(protyle, menuItem);
                break;
        }
        if (!menuItemObj) {
            return;
        }
        return menuItemObj.element;
    }

    // 合并多个 text 为一个 text
    private mergeNode(nodes: NodeListOf<ChildNode>) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType !== 3 && (nodes[i] as HTMLElement).tagName === "WBR") {
                nodes[i].remove();
                i--;
            }
        }
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType === 3) {
                if (nodes[i].textContent === "") {
                    nodes[i].remove();
                    i--;
                } else if (nodes[i + 1] && nodes[i + 1].nodeType === 3) {
                    nodes[i].textContent = nodes[i].textContent + nodes[i + 1].textContent;
                    nodes[i + 1].remove();
                    i--;
                }
            }
        }
    }

    private updateLanguage(languageElement: HTMLElement, protyle: IProtyle, id: string, nodeElement: HTMLElement, oldHtml: string, selectedLang: string) {
        languageElement.textContent = selectedLang === window.siyuan.languages.clear ? "" : selectedLang;
        if (!Constants.SIYUAN_RENDER_CODE_LANGUAGES.includes(languageElement.textContent)) {
            window.siyuan.storage[Constants.LOCAL_CODELANG] = languageElement.textContent;
            setStorageVal(Constants.LOCAL_CODELANG, window.siyuan.storage[Constants.LOCAL_CODELANG]);
        }
        const editElement = getContenteditableElement(nodeElement);
        if (Constants.SIYUAN_RENDER_CODE_LANGUAGES.includes(languageElement.textContent)) {
            nodeElement.dataset.content = editElement.textContent.trim();
            nodeElement.dataset.subtype = languageElement.textContent;
            nodeElement.className = "render-node";
            nodeElement.innerHTML = `<div spin="1"></div><div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div>`;
            processRender(nodeElement);
        } else {
            (editElement as HTMLElement).textContent = editElement.textContent;
            editElement.parentElement.removeAttribute("data-render");
            highlightRender(nodeElement);
        }
        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
        updateTransaction(protyle, id, nodeElement.outerHTML, oldHtml);
        this.subElement.classList.add("fn__none");
        focusByRange(this.range);
        return nodeElement.outerHTML;
    }
}
