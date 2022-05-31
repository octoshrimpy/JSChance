class JsChance {
  constructor(text) {
    this.json = JsChance.textToJson(text)
    this.options = {}

    this.genFunctions()
  }

  static deepFind(obj, keys) {
    let found = obj
    keys.forEach(function (key) { found = found[key] })
    return found
  }

  static textToJson(text) {
    let lines = text.split("\n").filter(function (word) {
      return word.replace(/\s/ig, "").length > 0
    })

    let json = {}, current_obj = json, parents = [], prev_key = undefined, prev_indent = -1
    let regx_indent = new RegExp("  ", "g")

    lines.forEach(function (line) {
      let key = line.trim()
      let current_indent = line.match(/\s+/g)?.[0]?.match(regx_indent)?.length || 0

      if (current_indent > prev_indent) {
        if (prev_key) { parents.push(prev_key) }
        current_obj = current_obj[prev_key] || current_obj
      } else if (current_indent < prev_indent) {
        for (let i = 0; i < (prev_indent - current_indent); i++) { parents.pop() }
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
        throw ("Not a valid argument: " + (typeof arg) + " (" + arg + ")")
      }
    } else if (args.length == 2 && this.isInt(args[0]) && this.isInt(args[1])) {
      // Num range like 10,15 inclusive
      let [min, max] = args.map(function (n) { return Number(n) })
      return Math.floor(this.rand() * (1 + max - min) + min)
    } else {
      return args[this.rand(args.length)]
    }
  }

  static parseText(text, parser) {
    let self = this
    let regx_square_brackets = /\[([^\[]*?)\]/ig
    do {
      text = text.replace(regx_square_brackets, function (full, group1) {
        if (parser && typeof parser[group1] == "function") {
          return parser[group1]()
        } else {
          return self.rand(group1)
        }
      })
    } while (regx_square_brackets.test(text))

    // console.log(text)
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

    return branches.map(function (branch) {
      return [...parents, ...branch]
    })
  }

  genFunction(fnName, json_options) {
    let self = this
    if (!fnName) { return }

    self.options[fnName] = json_options
    self[fnName] = function () {
      let opts = this.branchesFromJson(json_options)
      var option = opts[Math.floor(Math.random() * opts.length)]
      option[option.length - 1] = self.constructor.parseText(option[option.length - 1], self)

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
  static spacingOptions = {
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

  constructor() { }

  // @todo rocco clean this up lmao
  static parse(text) {
    this.spacing = PreProcessor.spacingOptions.TWOSPACE
    let lines = text.split("\n")

    this.shouldBeIndented = false

    this.detectedIndentCount = this.detectIndent(lines)
    lines = lines.flatMap((line, index) => {
      if (this.isLineOnlyComment(line)) {
        return []
      }
      line = this.tabsToSpaces(line)
      line = this.normalizeIndents(line)
      line = this.titleToGenerator(line, index)
      line = this.indentHeaderChildLine(line)
      line = this.removeMdList(line)

      return [line]
    })
    // console.log(lines.join('\n'))
    return lines.join('\n')
  }

  static removeMdList(text) {
    let mdListRegex = /(?<=^(\s+)?)((\d+\.\s)|(\*\s)|(\-\s))/g
    return text.replace(mdListRegex, "")
  }

  static tabsToSpaces(line) {
    return line.replace(/\t/g, this.spacingOptions.TWOSPACE.literal)
  }

  static normalizeIndents(line) {
    return line.replace(`/\s{${this.detectedIndentCount}}/g`, this.spacing.literal)
  }

  static indentHeaderChildLine(line) {
    if (!line || !!line.match(/(?<=^)(\s)+(?=$)/g)) {
      this.shouldBeIndented = false
      return line
    }
    if (this.shouldBeIndented) {
      // Only add the literal if we actually have the `shouldBeIndented` set
      line = this.spacing.literal + line
    }
    // Doing the indent before the check below so that we don't indent the line with ## as well
    if (!!line.match(/(?<=^(\s?)+(##\s+)\b).+/g)) {
      this.shouldBeIndented = true
      let lineHeaderStartRegex = /(?<=^(\s?)+)(##\s+)\b/g
      line = line.replace(lineHeaderStartRegex, "* ") // Replace doesn't modify inline, have to reassign the variable
    }

    return line
  }

  static isLineOnlyComment(line) {
    // grabs html comments as well as md line breaks: `--- / ===`
    let lineComment = /(?<=^)(\s?)+((<!--).+(-->)|(---+)|(===+))(?=$)/g

    return !!line.match(lineComment)
  }

  static titleToGenerator(line, index) {
    if (index == 0) {
      return line.replace('#', '*')
    }

    if (index == 1) {
      let outputRegex = /(?<=^(\s?)+(_)).+(?=_$)/g
      let match = line.match(outputRegex)
      return PreProcessor.spacingOptions.TWOSPACE.literal + "* " + match[0]
    }

    if (index > 1) {
      return line
    }
  }

  //https://medium.com/firefox-developer-tools/detecting-code-indentation-eff3ed0fb56b
  static detectIndent(lines) {
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

let string =
  `# landmark
_[[color]]_

## blue
* natural
  1. Series of small waterfalls
  1. Small "empty" lake
  1. Reflective ponds
  1. Waterfall
* manmade
  1. Grounded pirate ship
  1. Offensive statue
    * Labelled as "the \`1d6 adjective\` person alive"
    * Changes how it looks to be whoever is currently looking at it
    <!-- @think Revise adjectives to be all one-word negatives -->
  1. Large well
    * Bottom leads to air-filled underwater glass-walled dungeon
  1. Floating boulder
  1. Large arcs
  1. Library

## yellow
* natural
  1. Shelter / Ice cave
  1. Mushroom rings
  1. Glacier
    <!-- [?] :octoshrimpy missing lore -->
    <!--@todo Standardize all landmark names (Eliminate "a") -->
    * Optional earth / stone golem stuck in a piece of ice.
      * If you ask them what they're doing, they'll tell you they're "swimming in da river" (because they move so slow)
  1. Salt flats
  1. Bird hill
    * Birds wil always be on it
    * Migratory birds divert to fly over it
  1. HOPE tree
    * Hope carved into it, nobody knows who or why
    * Predates everyone in the area
* manmade
  1. Glass tree
    * Shatters anything that tries to break it
    * Has carved sign telling the stories of a dwarven king
  1. Giant banner 
    * Placed on very tall flagpole
  1. Tall weathered lone tower
    * Skeleton on ground under window outside
    * Has winding staircase with a puzzle
    * Top of tower is filled with hair, and a pair of scissors on windowsill. 
  1. Giant crystal shard 
    * Sticks out of ground
  1. Giant clock statue
    * Hands move backwards
  1. Sacred sanctuary 
    * Anyone who steps foot within does not need to rest for 1d4 days

  ---

color
  yellow
  blue
`

let landmarkGenerator = new JsChance(PreProcessor.parse(string))

let landmark_1 = landmarkGenerator.landmark()

console.log(landmark_1);

