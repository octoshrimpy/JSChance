class JsChance {
  constructor(text) {
    this.json = JsChance.textToJson(text)
    this.options = {}

    this.genFunctions()
  }

  static deepFind(obj, keys) {
    let found = obj
    keys.forEach(function(key) { found = found[key] })
    return found
  }

  static textToJson(text) {
    let lines = text.split("\n").filter(function(word) {
      return word.replace(/\s/ig, "").length > 0
    })

    let json = {}, current_obj = json, parents = [], prev_key = undefined, prev_indent = -1
    let regx_indent = new RegExp("  ", "g")

    lines.forEach(function(line) {
      let key = line.trim()
      let current_indent = line.match(/\s+/g)?.[0]?.match(regx_indent)?.length || 0

      if (current_indent > prev_indent) {
        if (prev_key) { parents.push(prev_key) }
        current_obj = current_obj[prev_key] || current_obj
      } else if (current_indent < prev_indent) {
        for (let i=0; i<(prev_indent - current_indent); i++) { parents.pop() }
        current_obj = JsChance.deepFind(json, parents)
      }

      current_obj[key] = {}
      prev_indent = current_indent
      prev_key = key
    })

    return json
  }

  static isInt(num) {
    return !Number.isNaN(Number(num))
  }

  static rand() {
    let args = Array.from(arguments)

    if (args.length == 0) {
      return Math.random()
    } else if (args.length == 1) {
      let arg = args[0]
      if (this.isInt(arg)) { // Check if an int
        return Math.floor(this.rand() * Number(arg)) // 0-int (exclude int)
      } else if (/\d+\-\d+/.test(arg)) { // Is a num range like 10-15
        let [num1, num2] = arg.split("-")
        return this.rand(num1, num2)
      } else if (typeof arg == "string" && arg.includes("|")) {
        return this.rand(...arg.split("|"))
      } else if (Array.isArray(arg)) {
        return this.rand(...arg)
      } else {
        throw("Not a valid argument: " + (typeof arg) + " (" + arg + ")")
      }
    } else if (args.length == 2 && this.isInt(args[0]) && this.isInt(args[1])) {
      // Num range like 10,15 inclusive
      let [min, max] = args.map(function(n) { return Number(n) })
      return Math.floor(this.rand() * (1 + max - min) + min)
    } else {
      return args[this.rand(args.length)]
    }
  }

  static parseText(text, parser) {
    let self = this
    let regx_square_brackets = /\[([^\[]*?)\]/ig

    do {
      text = text.replace(regx_square_brackets, function(full, group1) {
        if (parser && typeof parser[group1] == "function") {
          return parser[group1]()
        } else {
          return self.rand(group1)
        }
      })
    } while (regx_square_brackets.test(text))

    return text
  }

  branchesFromJson(json, parents) {
    parents = parents || []
    let branches = []

    for (let [key, obj] of Object.entries(json)) {
      if (Object.keys(obj).length == 0) {
        branches.push([key])
      } else {
        branches = [...branches, ...this.branchesFromJson(obj, [key])]
      }
    }

    return branches.map(function(branch) {
      return [...parents, ...branch]
    })
  }

  genFunction(fnName, json_options) {
    let self = this
    if (!fnName) { return }

    self.options[fnName] = json_options
    self[fnName] = function() {
      let opts = this.branchesFromJson(json_options)
      var option = opts[Math.floor(Math.random() * opts.length)]
      option[option.length-1] = self.constructor.parseText(option[option.length-1], self)

      return option.length <= 1 ? option[0] : option
    }
  }

  genFunctions() {
    for (let [key, opts] of Object.entries(this.json)) {
      this.genFunction(key, opts)
    }
  }
}
// ===================
// preprocessor

class PreProcessor {
  spacingOptions = {
    TWOSPACE: {
      literal: "  ",
      regexSelector: /\s{2}/g 
    },
    FOURSPACE: {
      literal: "    ",
      regex: /\s{4}/g
    },
    TAB: {
      literal: "	",
      regex: /\t/g
    }
  }

  constructor() {}

  // @todo rocco clean this up lmao
  parse(text) {
    this.spacing = this.spacingOptions.TWOSPACE
    let lines = text.split("\n")

    this.shouldBeIndented = false

    let self = this 
    self.detectedIndentCount = this.detectIndent(lines)
    lines = lines.map(function(line, idx) {
      lines[idx] = self.tabsToSpaces(line)
      lines[idx] = self.normalizeIndents(line)
      lines[idx] = self.removeMdList(line)
      lines[idx] = self.indentHeaderChildLine(line)
    })
    console.log(lines.join('\n'))
    return lines.join('\n')
  }

  removeMdList(text) {
    let mdListRegex = /(?<=^(\s+)?)((\d+\.\s)|(\*\s)|(\-\s))/g
    return text.replace(mdListRegex, "")
  }

  tabsToSpaces(line) {
    return line.replace(/\t/g, this.spacingOptions.TWOSPACE.literal)
  }

  normalizeIndents(line) {
    return line.replace(`/\s{${this.detectedIndentCount}}/g`, this.spacing.literal)
  }

  indentHeaderChildLine(line) {
    if (line.startsWith("## ")) { 
      this.shouldBeIndented = true
      let lineHeaderStartRegex = /(?<=^)##\s/g
      line.replace(lineHeaderStartRegex, "* ")
      // console.log("line: ", line)
    }
    if (!line) {
      this.shouldBeIndented = false
    }

    return this.spacing.literal + line
  }

  //https://medium.com/firefox-developer-tools/detecting-code-indentation-eff3ed0fb56b
  detectIndent(lines) {
    var indents = {}; // # spaces indent -> # times seen
    var last = 0;     // # leading spaces in the last line we saw
  
    lines.forEach(function (text) {
      // var width = this.detectIndent(text); .// replaced with regex below
      var width = text.match(/^\s*/)[0].length;
  
      var indent = Math.abs(width - last);
      if (indent > 1) {
        indents[indent] = (indents[indent] || 0) + 1;
      }
      last = width;
    });
  
    // find most frequent non-zero width difference
    var indent = null, max = 0;
    for (var width in indents) {
      width = parseInt(width, 10);
      var tally = indents[width];
      if (tally > max) {
        max = tally;
        indent = width;
      }
    }
    return indent;
  }
}


//=====

let string = `
# landmarks

## blue
* natural
  1. Series of small waterfalls
  1. Small "empty" lake 
    * Water is crystal clear
  1. Reflective ponds 
    * You cannot see the bottom of it
  1. Waterfall 
    * Reverses direction of water on full moon
    * Just the waterfall, not the rest of water around it
  1. Left-footed water
    * To penetrate water, first stick your left foot in.
    * Anyone stepping into water with their right foot will walk on the water. 
  1. Three worried stones 
    * They're looking into a lake
    * They disappear when not being looked at
    * Found hiding nearby
    * Reappear by lake if nobody nearby
* manmade
  1. Grounded pirate ship
  1. Offensive statue
    * Labelled as "the \`1d6 adjective\` person alive"
    * Changes how it looks to be whoever is currently looking at it
  <!-- @think Revise adjectives to be all one-word negatives -->
    1. Ugliest
    2. Dumbest
    3. Most indecisive
    4. Most incompetent
    5. Most ambitious
    6. Most clumsy
  1. Large well
    * Bottom leads to air-filled underwater glass-walled dungeon
  1. Floating boulder
    * Carved with glowing script that describes what is happening around it this very moment
  1. Large arcs 
    * Were used as portals but are deactivated now
    * Carved runes glow softly on the surface
  1. Library 
    * Maintained by ghosts with no voice 
    * All the books are filled with proper titles and chapter headings, but the contents of the pages are nonsense
`
let preprocessor = new PreProcessor()
let processed = preprocessor.parse(string)
// console.log(processed)
let parsed    = new JsChance(processed)

// console.log(string)
// console.log(parsed)