import {
	App, Editor, MarkdownView, Modal, Notice,
	Plugin, PluginSettingTab, Setting,
	ItemView, WorkspaceLeaf, TextFileView, MarkdownFileInfo, TFile, MarkdownRenderer, MarkdownSourceView,
} from 'obsidian';
import {
	CanvasNodeData,
	CanvasEdgeData,
} from 'obsidian/canvas';
import { Hiccup, renderHiccup } from 'src/mini-hiccup';
import create from 'zustand/vanilla'

export const VIEW_TYPE_EXAMPLE = "example-view";

// TODO: how to set View icon

// canvas stuff
// window.app.workspace.activeLeaf.view.canvas.updateSelection((t) => {console.log(t)})
// window.app.workspace.activeLeaf.view.canvas.getViewportNodes()[0].blur()

type MatchRange = [number, number]

function _getCurrentViewDataString(): string {
	return (window.app.workspace.getLeaf().view as any).getViewData() as string
}

function _highlightTextInRanges(app: App, currentText: string, characterRanges: Array<MatchRange>) {
	const activeFile = app.workspace.getActiveFile()
	if (activeFile) {
		this.app.workspace.getLeaf(false /* JT.isModEvent(event) */).openFile(activeFile, {
			active: !0,
			eState: {
				match: {
					content: currentText,
					matches: characterRanges
				}
			}
		})
	}
}

function openFileAndHighlightRanges(app: App, filePathInVault: string, matchCharacterRanges: Array<MatchRange>) {
	// if (app.workspace.activeEditor == null) {
	// 	return
	// }
	// window.app.vault.getAbstractFileByPath("README.md")
	app.workspace.openLinkText(filePathInVault, '').then(() => {
		_highlightTextInRanges(app, _getCurrentViewDataString(), matchCharacterRanges)
	})
}

function openFileAndHighlightTextMatches(app: App, filePathInVault: string, matchTextExpression: string) {
	if (app.workspace.activeEditor == null) {
		return
	}

	app.workspace.openLinkText(filePathInVault, '').then(() => {
		const currentText = _getCurrentViewDataString()
		const charRanges: Array<MatchRange> = []

		const searchPattern = new RegExp(matchTextExpression, "ig")
		let match: RegExpExecArray | null
		while (match = searchPattern.exec(currentText)) {
			charRanges.push([match.index, searchPattern.lastIndex])
		}
		_highlightTextInRanges(app, currentText, charRanges)
	})
}

function highlightNodesInCanvasMatchingSearchPattern(searchPattern: string): Array<any> {
	const maybeCanvasView = this.app.workspace.getLeaf().view
	const maybeCanvas = maybeCanvasView ? (maybeCanvasView as any)['canvas'] : null
	const matches: Array<any> = []
	if (maybeCanvas) {
		// const nodes: Array<any> = maybeCanvas.getViewportNodes()
		// const nodes: Array<any> = maybeCanvas.getData().nodes as Array<CanvasNodeData>
		maybeCanvas.updateSelection((selectedNodesSet: Set<CanvasNodeData>) => {
			selectedNodesSet.clear()
			for (const node of maybeCanvas.nodes.values()) {
				const nodeText = (node.text || node.filePath) as string
				const searchRegExp = new RegExp(searchPattern, "i")
				const maybeMatch = searchRegExp.exec(nodeText)
				if (maybeMatch) {
					const fromIndex = maybeMatch.index
					const toIndex = searchRegExp.lastIndex
					selectedNodesSet.add(node)
					matches.push(node)
					// viewportNode.select()
					// viewportNode.focus()
				} else {
					// viewportNode.deselect()
					// viewportNode.blur()
				}
			}
		})
	}
	return matches
}

class SearchResult {
	link: string
	engineName: string
	matchDisplayText: string
}

class OpenableSearchResult extends SearchResult {
	static ENGINE_NAME = 'OpenableSearchResult'

	fromIndex: number
	toIndex: number
	matchString: string

	constructor(
		public app: App,
		public settings: MyPluginSettings,
	) {
		super()
		this.engineName = (this.constructor as any).ENGINE_NAME
	}

	static async getMatches(app: App, settings: MyPluginSettings, queryString: string): Promise<Array<OpenableSearchResult>> {

		const promises = getAllCanvasFiles().map(async (canvasFile) => {
			return getFileContentAsync(canvasFile.path).then((rawContent) => {
				for (const node of JSON.parse(rawContent).nodes) {
					if (node.text && (node.text.indexOf(queryString) > -1)) {
						return canvasFile
					} else if (node.file && (node.file.indexOf(queryString) > -1)) {
						return canvasFile
					}
				}
			})
		})
		return Promise.all(promises).then((canvasFileMatches) => {
			const out: OpenableSearchResult[] = []
			for (const canvasFile of canvasFileMatches) {
				if (!canvasFile) {
					continue
				}
				const searchResult = new OpenableSearchResult(app, settings)
				searchResult.fromIndex = 0
				searchResult.toIndex = 1
				searchResult.matchString = queryString
				searchResult.matchDisplayText = canvasFile.path
				searchResult.link = canvasFile.path
				out.push(searchResult)
			}
			return out
		})
	}

	render(): Hiccup {
		return [
			"div.tree-item-inner", {
				onClick: (event: PointerEvent) => {
					console.log("opening...", this)
					this.open()
				},
			}, [
				"code", {
					style: {
						"font-size": "x-small",
					},
				},
				this.engineName,
			],
			[
				"span", {
					style: {

					},
				},
				`${this.matchString} appears in ${this.matchDisplayText}`,
			]
		]
	}

	open() {
		console.log("GOING FOR", this.link, [[this.fromIndex, this.toIndex]])
		if (this.link.endsWith(".canvas")) {
			this.app.workspace.openLinkText(this.link, '')
		} else {
			openFileAndHighlightRanges(this.app, this.link, [[this.fromIndex, this.toIndex]])
		}
	}
}

class CanvasMatcher extends OpenableSearchResult {
	static ENGINE_NAME = 'CanvasMatch'
	canvasFile: string

	static async getMatches(app: App, settings: MyPluginSettings, filePath: string): Promise<Array<CanvasMatcher>> {

		const canvasLinks: Array<CanvasEdgeData> = []

		const canvasFiles = getAllCanvasFiles()

		const promises = canvasFiles.map(async (canvasFile) => {
			const matches: Array<CanvasMatcher> = []
			return getFileContentAsync(canvasFile.path).then((fileContent) => {
				const canvasData = JSON.parse(fileContent)
				for (const node of (canvasData['nodes'] ?? [])) {
					if (node['file'] == filePath) {
						const currentNodeId = node['id']
						for (const edge of canvasData['edges']) {
							if (edge['fromNode'] == currentNodeId || edge['toNode'] == currentNodeId) {
								canvasLinks.push(edge['id'])
							}
						}
						const searchResult = new CanvasMatcher(app,
							DEFAULT_SETTINGS
							//  (app as any).setting
						)
						searchResult.matchString = filePath
						searchResult.matchDisplayText = `${filePath} is in ${canvasFile.path}`
						searchResult.link = filePath
						searchResult.canvasFile = canvasFile.path
						matches.push(searchResult)
						break
					}
				}

				return Promise.resolve(matches)
			})
		})

		return Promise.all(promises).then((allMatches) => {
			return Array.prototype.concat.apply([], allMatches)
		})

	}

	render(): Hiccup {
		return ["div",
			[
				"div", {
					style: {
						background: "yellow",
						color: "black",
					},
					onClick: () => {
						this.app.workspace.openLinkText(this.canvasFile, '').then((thing) => {
							highlightNodesInCanvasMatchingSearchPattern(this.link)
						})
						// doesn't work because the file only goes into the files map
						// after it has been opened in the workspace
						// app.workspace.getLeaf().openFile(
						// 	(app.vault.adapter as any /* FIXME */
						// 	)['files'][FIXME_mainCanvasFile]
						// ).then(() => {
						// 	highlightNodesInCanvasMatchingSearchPattern(activeFilePath)
						// })
					},
				},
				["h3", this.matchDisplayText],
			],
		]
	}

	open() {

	}
}


function focusOnNode(canvas: any, node: any) {
	canvas.zoomToBbox({
		minX: node.x - node.width * 1,
		minY: node.y - node.height * 1,
		maxX: node.x + node.width * 1,
		maxY: node.y + node.height * 1,
	})
}

interface Connector {
	location?: any
	matchText: string
}

interface TrackerAttributes {
	canvasNodes: Record<string, number>
	tags: Record<string, number>
	links: Record<string, number>
}

interface ConnectionTracker {
	path: string,
	tags: Array<Connector>,
	links: Array<Connector>,
	urls: Array<Connector>,
}

function getAllCanvasFiles(): Array<TFile> {
	return app.vault.getFiles().filter((file) => {
		return file.path.endsWith(".canvas")
	})
}

async function getFileContentAsync(filePath: string): Promise<string> {
	return app.vault.adapter.read(filePath)
}

async function getAllCanvasNodeMappings(): Promise<Record<string, Array<string>>> {
	return Promise.all(getAllCanvasFiles().map((canvasFile) => {
		return getFileContentAsync(canvasFile.path).then((content) => {
			return {
				path: canvasFile.path,
				content,
			}
		})
	})).then((allCanvasesFileContents) => {
		const out: Record<string, Array<string>> = {}
		for (const taggedCanvasContent of allCanvasesFileContents) {
			const canvasData = JSON.parse(taggedCanvasContent.content).nodes.map((node: any) => {
				const key = node.text || node.file
				if (!out[key]) {
					out[key] = []
				}
				out[key].push(taggedCanvasContent.path)
			})
		}
		return out
	})
}

async function getAllConnections(app: App): Promise<Array<ConnectionTracker>> {

	function extractConnections(path: string, rawContent: string): ConnectionTracker {
		const connections: ConnectionTracker = {
			path: path,
			tags: [],
			links: [],
			urls: [],
		}
		const tagRegExp = /\[\[(\w+)\]\]/g
		const urlRegExp = /(\w+):\/\/(\w+)\.(\w+)/g
		const frontMatterLines: Array<string> = []
		const contentLines: Array<string> = []

		for (
			let lines = rawContent.split(/\r?\n/g),
			i = 0,
			isInFrontMatter = false
			; i < lines.length; ++i
		) {
			const line = lines[i].trim()
			if (i == 0) {
				if (line.match(/^---$/)) {
					isInFrontMatter = true
				}
			} else if (isInFrontMatter) {
				if (line.match(/^---$/)) {
					isInFrontMatter = false
				} else {
					if (line.startsWith('- ')) {
						// dumb match
						connections.tags.push({
							matchText: line.substring(2).trim(),
						})
					}
				}
			} else {
				contentLines.push(line)
				let match: RegExpExecArray | null
				while (match = tagRegExp.exec(line)) {
					connections.tags.push({
						matchText: match[1].toLowerCase(),
					})
				}
			}
		}
		const frontMatter = frontMatterLines.join('\n')
		const content = contentLines.join('\n')

		return connections
	}
	const promises = app.vault.getFiles().map(async (file) => {
		return app.vault.cachedRead(file).then((rawContent) => {
			return extractConnections(file.path, rawContent)
		})
	})
	return Promise.all(promises)
}

export class ExampleView extends ItemView {
	mainContainer: Element
	pollingDisplayContainer: Element

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getEditor(): Editor | undefined {
		return this.app.workspace.activeEditor?.editor
	}


	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		return "Example view WHAT?";
	}

	createEntry() {

	}

	getActiveCanvas(): any {
		const maybeCanvasView = this.app.workspace.getLeaf().view
		return maybeCanvasView ? (maybeCanvasView as any)['canvas'] : null
	}

	async onOpen() {

		this.mainContainer = this.containerEl.children[1];
		this.mainContainer.empty();
		let searchQueryText: string = ""
		let searchStatusText: string = ""

		let focusedNodeOffsetIndex = 0
		let searchStatusElement = renderHiccup(["div", {}, "status"])
		let canvasMatchesRows = renderHiccup(["div", {}, "matches"])
		let orphanRows = renderHiccup(["div", {}, "orphans"])
		const SearchSectionComponent = renderHiccup(["div",
			["input", {
				type: "text",
				value: searchQueryText,
				onChange: (event: InputEvent) => {
					searchQueryText = (event.target as any).value as string
				}
			}],
			["button", {
				type: "button",
				onClick: () => {
					console.log("clicked me", searchQueryText)
					if (searchQueryText == null || searchQueryText.length == 0) {
						return
					}
					let matchedNodes = highlightNodesInCanvasMatchingSearchPattern(searchQueryText)
					searchStatusElement.empty()
					searchStatusElement.appendChild(renderHiccup([
						"h3",
						`found ${matchedNodes.length} matches`,
					]))

					canvasMatchesRows.empty()
					canvasMatchesRows.appendChild(renderHiccup([
						"div", {
							style: { display: "table" },
						},
						...matchedNodes.map((node) => {
							return [
								"div", {
									style: { display: "table-row" },
								},
								[
									"div", {
										style: { display: "display-cell" },
									},
									[
										"button", {
											style: {
												border: "1px solid gray",
											},
											type: "button",
											onClick: () => {
												focusOnNode(this.getActiveCanvas(), node)
											},
										},
										`${node.text || node.filePath}`
									]
								]
							]
						})
					]))
					focusedNodeOffsetIndex = 0
				}
			}, "search in canvas"],
			["button", {
				type: "button",
				onClick: () => {
					const maybeCanvas = this.getActiveCanvas()
					if (!maybeCanvas) {
						return
					}
					const selectedNodes = Array.from(maybeCanvas.selection)
					if (selectedNodes.length == 0) {
						console.log("is empty")
						return
					}
					else {
						focusOnNode(maybeCanvas, selectedNodes[focusedNodeOffsetIndex++ % selectedNodes.length])
					}
				}
			}, "zoom to selected"],
			["button", {
				type: "button",
				onClick: () => {
					const maybeCanvas = this.getActiveCanvas()
					if (!maybeCanvas) {
						return
					}
					const parents = new Set()
					for (const node of maybeCanvas.selection) {
						for (const edge of maybeCanvas.getEdgesForNode(node)) {
							if (edge.to.node.id == node.id) {
								parents.add(edge.from.node)
							}
						}
					}
					maybeCanvas.selectAll(parents)
				}
			}, "select parents"],
			["button", {
				type: "button",
				onClick: () => {
					const maybeCanvas = this.getActiveCanvas()
					if (!maybeCanvas) {
						return
					}
					const children = new Set()
					for (const node of maybeCanvas.selection) {
						for (const edge of maybeCanvas.getEdgesForNode(node)) {
							if (edge.from.node.id == node.id) {
								children.add(edge.to.node)
							}
						}
					}
					maybeCanvas.selectAll(children)
				}
			}, "select children"],
			["button", {
				type: "button",
				onClick: () => {
					const maybeCanvas = this.getActiveCanvas()
					if (maybeCanvas) {
						maybeCanvas.deselectAll()
					}
				}
			}, "clear"],
			searchStatusElement,
			canvasMatchesRows,
			["button", {
				type: "button",
				onClick: () => {
					orphanRows.empty()

					getAllCanvasNodeMappings().then((nodeCanvasMapping) => {
						getAllConnections(this.app).then((trackers) => {
							const parentTrackerLookup: Record<string, Record<keyof TrackerAttributes, Set<string>>> = Object.fromEntries(
								trackers.map((tracker) => {
									return [tracker.path, {
										canvasNodes: new Set([]),
										tags: new Set([]),
										links: new Set([]),
									}]
								})
							)
							for (const tracker of trackers) {
								for (const containingCanvasPath of nodeCanvasMapping[tracker.path] ?? []) {
									parentTrackerLookup[tracker.path].canvasNodes.add(containingCanvasPath)
								}
								let attrName: keyof TrackerAttributes
								for (attrName of ['tags', 'link'] as Array<keyof TrackerAttributes>) {
									for (const attrValue of (tracker as any)[attrName] ?? []) {
										const attrText = (attrValue as Connector).matchText as string
										(parentTrackerLookup[tracker.path] as any)[attrName].add(attrText)
									}
								}
							}

							const matchedFiles = new Set(trackers.filter(tracker => {
								return parentTrackerLookup[tracker.path].tags.size == 0
									&& parentTrackerLookup[tracker.path].links.size == 0
									&& parentTrackerLookup[tracker.path].canvasNodes.size == 0
							}).map(t => t.path))
							const orphans = app.vault.getFiles().filter((file) => {
								return matchedFiles.has(file.path)
							}).map((file) => {
								// const searchResult = new OpenableSearchResult(this.app, DEFAULT_SETTINGS)  // FIXME
								return {
									...file,
									...parentTrackerLookup[file.path],
								}
							})
							if (orphans.length == 0) {
								orphanRows.appendChild(renderHiccup([
									"div", {
										style: {
										},
									},
									"no orphans"
								]))
							} else {
								const orphanRowsTable = [
									"div", {
										style: {
											display: "table",
											"font-family": "monospace",
										},
									},
									[
										"div", {
											style: {
												display: "table-row",
											},
										},
										[
											"div", {
												style: {
													display: "table-cell",
												}
											},
											`${orphans.length} orphans`
										]
									],
									[
										"div", {
											style: {
												display: "table-row",
											},
										},
										...["canvas", "link", "tag", "path"].map((header) => {
											return [
												"div", {
													style: {
														display: "table-cell",
													}
												},
												header
											]
										})
									],
									...orphans.map((orphan) => {
										return [
											"div", {
												style: {
													display: "table-row",
												},
												onClick: () => {
													this.app.workspace.openLinkText(orphan.path, '')
												}
											},
											["div", {
												style: {
													display: "table-cell",
												},
											},
												`${parentTrackerLookup[orphan.path].canvasNodes.size}`
											],
											["div", {
												style: {
													display: "table-cell",
												},
											},
												`${parentTrackerLookup[orphan.path].links.size}`
											],
											["div", {
												style: {
													display: "table-cell",
												},
											},
												`${parentTrackerLookup[orphan.path].tags.size}`
											],
											["div", {
												style: {
													display: "table-cell",
												},
											},
												`${orphan.path}`,
											],
										]
									})
								]
								orphanRows.appendChild(renderHiccup(orphanRowsTable))
							}
						})
					})
				}
			}, "find orphans"],
			orphanRows,
		])
		this.mainContainer.appendChild(SearchSectionComponent)

		const enginesToRun = {
			[OpenableSearchResult.ENGINE_NAME]: true,
			[CanvasMatcher.ENGINE_NAME]: true,
		}

		interface MyAppState {
			currentFocusedFilePath: string | null
			matchesToDisplay: Array<OpenableSearchResult>
			runningEngines: Record<string, boolean>
			fooTest: Array<any>
		}
		const store = create<MyAppState>(() => ({
			currentFocusedFilePath: null,
			matchesToDisplay: [],
			runningEngines: { ...enginesToRun },
			fooTest: [],
		}))
		const { getState, setState, subscribe, destroy } = store

		function runRelevanceEngines() {
			const activeFilePath = window.app.workspace.getActiveFile()?.path
			if (!activeFilePath) {
				console.log("No active file path")
				return
			}

			const currentState = getState()
			if (activeFilePath != currentState.currentFocusedFilePath) {
				setState({
					...currentState,
					currentFocusedFilePath: activeFilePath,
				})
			}

			const newMatchesToDisplay = [...currentState.matchesToDisplay]
			function removeEngineResults(engineName: string) {
				for (let i = newMatchesToDisplay.length - 1; i >= 0; --i) {
					if (newMatchesToDisplay[i].engineName == engineName) {
						newMatchesToDisplay.splice(i, 1)
					}
				}
			}

			if (searchQueryText.length > 0) {
				OpenableSearchResult.getMatches(
					app,
					DEFAULT_SETTINGS
					//  (app as any).setting
					, searchQueryText
				).then((matches) => {
					removeEngineResults(OpenableSearchResult.ENGINE_NAME)
					Array.prototype.push.apply(newMatchesToDisplay, matches)
					currentState.runningEngines[OpenableSearchResult.ENGINE_NAME] = false

					newMatchesToDisplay.sort((a, b) => {
						return a.engineName > b.engineName ? 1 : -1
					})

					console.log(`setting state to ${newMatchesToDisplay.length} entries`)

					setState({
						...currentState,
						matchesToDisplay: newMatchesToDisplay,
					})
				})
			}

			if (activeFilePath) {
				CanvasMatcher.getMatches(app,
					// (app as any).setting
					DEFAULT_SETTINGS,
					activeFilePath
				).then((matches) => {
					removeEngineResults(CanvasMatcher.ENGINE_NAME)
					Array.prototype.push.apply(newMatchesToDisplay, matches)
					currentState.runningEngines[CanvasMatcher.ENGINE_NAME] = false
				}).then(() => {

					newMatchesToDisplay.sort((a, b) => {
						return a.engineName > b.engineName ? 1 : -1
					})

					console.log(`setting state to ${newMatchesToDisplay.length} entries`)

					setState({
						...currentState,
						matchesToDisplay: newMatchesToDisplay,
					})

				})
			}
		}

		subscribe((currentState, previousState) => {
			const activeFilePath = currentState.currentFocusedFilePath
			if (!activeFilePath) {
				console.log("subscriber has no active path")
				return
			}

			if (this.pollingDisplayContainer == null) {
				this.pollingDisplayContainer = this.mainContainer.createEl("div")
			}

			const container = this.pollingDisplayContainer
			container.empty()

			let maybeCanvasInfoElements: Array<any> = []
			if (activeFilePath.endsWith(".canvas")) {
				const maybeCanvas = this.getActiveCanvas()
				if (maybeCanvas) {
					maybeCanvasInfoElements = ["table",
						["tbody",
							["tr",
								["th", "nodes"],
								["td", `${maybeCanvas.nodes.size}`]
							],
							["tr",
								["th", "visible"],
								["td", `${maybeCanvas.getViewportNodes()?.length}`],
							],
						]
					]
				}
			}

			const header = renderHiccup([
				"div",
				[
					"h4",
					`${currentState.currentFocusedFilePath} (${currentState.matchesToDisplay?.length} connections)`
				],
				maybeCanvasInfoElements,
			])
			container.appendChild(header)

			const hiccup: Array<any> = ["div.search-results-container", {
				style: {
					border: `2px solid rgb(${Math.random() * 256}, ${Math.random() * 256}, ${Math.random() * 256})`,
				}
			},
			]

			Array.prototype.push.apply(hiccup, currentState.matchesToDisplay.map(sr => sr.render()))

			hiccup.push(["div.tree-item-self.is-clickable.outgoing-link-item",
				{ "draggable": "true" },
			])
			container.appendChild(renderHiccup(hiccup))
		})

		this.mainContainer.appendChild(renderHiccup([
			"div", [
				["button", {
					type: "button",
					onClick: () => { runRelevanceEngines() },
				},
					"run relevance engines"
				]
			]
		]))
		// this.registerInterval(window.setInterval(() => {
		// 	const currentState = getState()
		// 	if (Object.values(currentState.runningEngines).reduce((a, b) => a || b, false)) {
		// 		runRelevanceEngines()
		// 	}
		// }, 2222))

		app.workspace.on('file-open', (file) => {
			const currentState = getState()
			setState({
				...currentState,
				currentFocusedFilePath: file?.path,
				runningEngines: { ...enginesToRun },
				matchesToDisplay: [],
			})
		})
		runRelevanceEngines()

	}

	async onClose() {
		// Nothing to clean up.
	}
}

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: VIEW_TYPE_EXAMPLE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0]
		);
	}

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
			this.activateView()
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		console.log("registering view...")
		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => {
				return new ExampleView(leaf)
			}
		)
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');

		const connection = new WebSocket(`ws://localhost:11112`)
		connection.onopen = (event) => {
			console.info('socket connected')
		}
		connection.onclose = () => {
			console.warn(`socket closed; retrying`)

		}
		connection.onmessage = function (event) {
			let message = (event.data ?? '').trim()
			let newElement = document.createElement('div')
			newElement.innerHTML = message
			contentEl.innerHTML = ''
			contentEl.appendChild(newElement)
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for my awesome plugin.' });

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}


if (true) {
	// (window as any)['fun'] = openFileAndHighlightRanges
	console.log('%cHELLO, last reload: ' + new Date(), 'font-size:24pt;color:lime;')
}
