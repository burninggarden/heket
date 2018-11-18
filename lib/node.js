
var
	extend   = require('./utilities/extend'),
	contains = require('./utilities/contains');

var
	Core = require('./core');

var
	CircularRuleReferenceError = require('./errors/circular-rule-reference'),
	RuleNotFoundError          = require('./errors/rule-not-found');


/**
 * An enum map of the supported bases per the ABNF specification.
 * The associated letter corresponds to the prefix value used within the
 * actual ABNF grammars being parsed in order to denote the base to use
 * for numeric values.
 */
const BASES = {
	BINARY:      'b',
	DECIMAL:     'd',
	HEXADECIMAL: 'x'
};

/**
 * A map of the supported digit values, as strings, that are supported when a
 * particular numeric base is specified. In other words, if the grammar
 * specifies one of these bases for a numeric value or range, only values
 * within the associated array may be used. Pretty self-explanatory!
 */
const NUMERIC_DIGITS = {
	[BASES.BINARY]:      ['0', '1'],
	[BASES.DECIMAL]:     ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	[BASES.HEXADECIMAL]: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
	                      'A', 'B', 'C', 'D', 'E', 'F']
};


/**
 * A counter we can use to assign unique ids to nodes as they're created.
 * Nodes are passed around a lot between other classes internal to Heket,
 * and we need some way of keeping track of their identities.
 */
var CURRENT_ID = 0;


class Node {

	constructor() {
		// Assign the unique identifier for this node as soon as it's created:
		this.assignId();
	}

	/**
	 * Assigns the unique identifier for this node. Self-explanatory. See the
	 * comment for the CURRENT_ID value above for more context.
	 *
	 * @returns {self}
	 */
	assignId() {
		this.setId(CURRENT_ID++);
	}

	/**
	 * Sets this node's unique id.
	 *
	 * @param   {int} id
	 * @returns {self}
	 */
	setId(id) {
		this.id = id;
		return this;
	}

	/**
	 * Returns this node's unique id.
	 *
	 * @returns {int}
	 */
	getId() {
		return this.id;
	}

	/**
	 * Sets the raw ABNF string corresponding to this node. We'll use this
	 * string to parse out the nested node structure used to embody the
	 * corresponding ABNF grammar.
	 *
	 * @param   {string} string
	 * @returns {self}
	 */
	setString(string) {
		this.string = string;

		return this;
	}

	/**
	 * @returns {string}
	 */
	getString() {
		return this.string;
	}

	/**
	 * @param   {int} position
	 * @returns {self}
	 */
	setPosition(position) {
		this.position = position;
		this.index = position;
		return this;
	}

	/**
	 * @returns {string}
	 */
	getPosition() {
		return this.position;
	}

	setLength(length) {
		this.length = length;
		return this;
	}

	getLength() {
		return this.length;
	}

	/**
	 * This is where the magic happens! This method reads the string property
	 * associated with this node, token by token. Depending on what tokens
	 * it encounters, it will recursively flesh out the AST structure necessary
	 * to embody the corresponding ABNF grammar for this node and its
	 * descendents.
	 *
	 * Depending on what character we encounter next, we want to take different
	 * actions in order to generate the AST.
	 *
	 * An important note: once it determines what type of action should be
	 * performed on the basis of a token being encountered, this method calls
	 * other methods that actually perform the necessary action. These outside
	 * methods increment the `index` local property for this node in order to
	 * skip past the portion of the ABNF string that they successfully parsed.
	 *
	 * This means that the `while` loop below will not directly encounter every
	 * token in the ABNF string.
	 *
	 * For this reason, it's safe for us to assume certain conditions when we
	 * encounter specific tokens in the loop below. For instance, even though
	 * it's possible for, say, the "(" token to be included in a quoted string,
	 * as opposed to actually corresponding to a grouping operation, we can
	 * assume that any quoted strings will be bypassed by the appropriate
	 * sub-method, so that we would never encounter such tokens as contained
	 * within raw strings during the iteration within this method.
	 *
	 * @returns {self}
	 */
	parse() {
		// Walk token by token over our corresponding string.
		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			switch (character) {
				// ( will always correspond to the start of a new grouping.
				case '(':
					this.parseGroup();
					break;

				// [ will always correspond to the start of a new optional
				// value.
				case '[':
					this.parseOptional();
					break;

				// " will always correspond to the start of a quoted string
				// literal.
				case '"':
					this.parseString();
					break;

				// % will always correspond to the start of a numeric literal.
				case '%':
					this.parseNumeric();
					break;

				// The following tokens will always correspond to the start of
				// a repetition clause.
				case '*':
				case '0':
				case '1':
				case '2':
				case '3':
				case '4':
				case '5':
				case '6':
				case '7':
				case '8':
				case '9':
					this.parseRepeat();
					break;

				// / always indicates the beginning of an alternative value.
				case '/':
					this.parseAlternative();
					break;

				// Spaces and tabs should always be parsed as noop whitespace.
				case ' ':
				case '\t':
					this.parseWhitespace();
					break;

				// Anything else should be parsed as an ABNF rule name.
				default:
					this.parseRuleName();
					break;
			}
		}

		return this;
	}

	parseGroup() {
		var
			token             = '',
			parentheses_count = 0;

		// Advance past the initial starting bracket:
		this.index++;

		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			this.index++;

			if (character === ')') {
				if (parentheses_count === 0) {
					break;
				}

				parentheses_count--;
			} else if (character === '(') {
				parentheses_count++;
			}

			token += character;
		}

		if (parentheses_count !== 0) {
			throw new Error('invalid parentheses');
		}

		var child_node = Node.fromString(token);

		return this.addChildNode(child_node);
	}

	parseOptional() {
		var
			token         = '',
			bracket_count = 0;

		// Advance past the initial starting bracket:
		this.index++;

		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			this.index++;

			if (character === ']') {
				if (bracket_count === 0) {
					break;
				}

				bracket_count--;
			} else if (character === '[') {
				bracket_count++;
			}

			token += character;
		}

		if (bracket_count !== 0) {
			throw new Error('invalid brackets');
		}

		var child_node = Node.fromString(token);

		child_node.setIsOptional();

		return this.addChildNode(child_node);
	}

	parseString() {
		var
			token            = '',
			found_end_quotes = false,
			start_position   = this.index;

		// Advance past the initial double quotes:
		this.index++;

		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			this.index++;

			if (character === '"') {
				found_end_quotes = true;
				break;
			}

			token += character;
		}

		if (!found_end_quotes) {
			let substring = this.string.slice(this.index);

			throw new Error(`Invalid quotes: ${substring}`);
		}

		var child_node = (new Node())
			.setString(this.getString())
			.setPosition(start_position)
			.setLength(this.index - start_position)
			.setQuotedString(token);

		return this.addChildNode(child_node);
	}

	getDecimalValueForNumericTokenAndBase(token, base) {
		switch (base) {
			case BASES.BINARY:
				return parseInt(token, 2);

			case BASES.DECIMAL:
				return parseInt(token, 10);

			case BASES.HEXADECIMAL:
				return parseInt(token, 16);

			default:
				throw new Error(
					`Unsupported base specified: ${base}`
				);
		}
	}

	parseNumeric() {
		var start_position = this.index;

		// Advance past the initial % signifier:
		this.index++;

		var base = this.string[this.index];

		// Advance past the base signifier:
		this.index++;

		var allowed_digits = NUMERIC_DIGITS[base];

		if (!allowed_digits) {
			throw new Error('Invalid base');
		}

		var
			nodes = [ ],
			token = '';

		var current_node = (new Node())
			.setNumericBase(base)
			.setString(this.getString())
			.setPosition(this.index);

		while (this.index < this.position + this.length) {
			let
				character  = this.string[this.index],
				// Fuck JavaScript. No elegant way to break out of a while loop
				// from within a switch block...
				break_loop = false;

			switch (character) {
				case '.':
					if (current_node.hasNumericRange()) {
						current_node.setNumericEndToken(token);

						nodes.push(current_node);

						current_node = (new Node())
							.setNumericBase(base)
							.setString(this.getString())
							.setPosition(this.index);

					} else {
						current_node.addNumericSetToken(token);
					}

					token = '';
					break;

				case '-':
					current_node.setNumericStartToken(token);
					token = '';
					break;

				case '/':
				case ' ':
					break_loop = true;
					break;

				default:
					// Just in case they specified a lowercase a-f in a hex
					// base numeric:
					character = character.toUpperCase();

					if (!contains(allowed_digits, character)) {
						throw new Error(`
							Invalid ${base} numeric
							(got illegal character ${character})
						`);
					}

					token += character;
					break;
			}

			if (break_loop) {
				break;
			}

			this.index++;
		}

		if (current_node.hasNumericRange()) {
			current_node.setNumericEndToken(token);
		} else {
			current_node.addNumericSetToken(token);
		}

		if (!nodes.length) {
			current_node.setPosition(start_position);

			return this.addChildNode(current_node);
		}

		nodes.push(current_node);

		var group_node = (new Node())
			.setString(this.getString())
			.setPosition(start_position)
			.setLength(this.index - start_position);

		nodes.forEach(function each(node) {
			group_node.addChildNode(node);
		});

		return this.addChildNode(group_node);
	}

	parseRepeat() {
		var
			token             = '',
			has_seen_asterisk = false,
			start_position    = this.index;

		// NOTICE: We don't advance past the initial token in this case.

		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			if (character === '*') {
				if (has_seen_asterisk) {
					throw new Error('invalid repeat');
				}

				has_seen_asterisk = true;
			} else if (!/[0-9]/.test(character)) {
				break;
			}

			token += character;

			// NOTICE: We increment the index *after* performing the token
			// concatenation, in the case of a repeat. This differs from
			// the behavior of the other parsing methods in this class,
			// because in the case of a repeat, there is no terminal
			// signifier to indicate the end of the repeat expression.
			// We have to deduce it by encountering a non-numeric character.
			this.index++;
		}

		var
			min_repeats,
			max_repeats;

		if (!has_seen_asterisk) {
			min_repeats = max_repeats = parseInt(token);
		} else {
			let parts = token.split('*');

			min_repeats = parseInt(parts[0]) || 0;
			max_repeats = parseInt(parts[1]) || Infinity;
		}

		var node = (new Node())
			.setString(this.getString())
			.setPosition(start_position)
			.setLength(this.index - start_position)
			.setMinRepeats(min_repeats)
			.setMaxRepeats(max_repeats);

		return this.setQueuedRepeat(node);
	}

	addAlternative(alternative_node) {
		if (!this.hasAlternatives()) {
			this.groupChildNodes();
			this.setHasAlternatives();
		}

		return this.addChildNode(alternative_node);
	}

	/**
	 * An alternative value has been identified. Parse it and increment the
	 * node's string index to the next alternative "/" slash, if one exists.
	 * If present, the next slash signifies the beginning of the next
	 * alternative.
	 *
	 * @returns {self}
	 */
	parseAlternative() {
		// Advance past the initial "/" signifier:
		this.index++;

		// A variable to hold the substring being incrementally built up
		// for the alternative value.
		var token = '';

		// We need to keep track of whether the current string position is
		// located within a quoted string literal. If so, we need to ignore
		// the appearance of any "/" tokens, as they're part of the literal
		// and not meant to signify the next alternative.
		var within_quoted_string = false;

		// Same with groups. Except with groups, we need to keep track of
		// the level of nesting, since we can have groups within groups.
		var nested_group_level = 0;

		// Walk along the ABNF string, token by token. Break if/when we
		// encounter another "/" alternative signifier.
		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			// If we hit a "/" signifier and we're not currently within a
			// string literal or group, bail out.
			if (
				   character === '/'
				&& !within_quoted_string
				&& nested_group_level === 0
			) {
				break;
			}

			// If we encounter a double quote, it means that a string literal
			// is either starting or ending, so flip the flag.
			if (character === '"') {
				within_quoted_string = !within_quoted_string;
			}

			if (!within_quoted_string) {
				if (character === '(') {
					nested_group_level++;
				} else if (character === ')') {
					nested_group_level--;
				}
			}

			token += character;

			this.index++;
		}

		// Create a child node for the alternative value; the child node
		// will be responsible for parsing its actual contents. All we need
		// to care about is knowing that it's an alternative to any other
		// child nodes we currently have.
		var child_node = Node.fromString(token);

		return this.addAlternative(child_node);
	}

	/**
	 * Pretty straightforward; keep advancing until we hit a non-whitespace
	 * character. Whitespace between ABNF statements is always a noop.
	 *
	 * @returns {self}
	 */
	parseWhitespace() {
		while (this.index < this.position + this.length) {
			let character = this.string[this.index];

			if (character !== ' ' && character !== '\t') {
				break;
			}

			this.index++;
		}

		return this;
	}

	/**
	 * Parse the current word in the ABNF grammar string as a rule name.
	 *
	 * @throws {Error} if the rule name is invalid per the spec
	 * @returns {self}
	 */
	parseRuleName() {
		var
			character      = this.string[this.index],
			start_position = this.index;

		// The ABNF specification allows the wrapping of rule names in < >.
		// These delimiters are entirely optional, and only exist to improve
		// readability. If we encounter one as the first character in the
		// rule name, we can safely bypass it.
		if (character === '<') {
			this.index++;
			character = this.string[this.index];
		}

		// Slightly different rules for the first character in a rule name --
		// no hyphen allowed here. Note that we don't need to perform this
		// check *after* iterating over the rule name, because we'll only
		// add characters to the rule name string if the character is allowed.
		//
		// That means that we'll bail on parsing the rule name if we encounter
		// anything weird, but the next call to this method from within the
		// general parse() loop will force the offending character into this
		// check anyway.
		if (!/[A-Za-z0-9]/.test(character)) {
			let substring = this.string.slice(this.index);

			throw new Error(
				`Invalid rule name: ${substring}`
			);
		}

		var token = '';

		// Iterate over the ABNF string and pull out the rule name.
		while (this.index < this.position + this.length) {
			character = this.string[this.index];

			// If the character isn't supported, we assume the rule name
			// is complete.
			if (!/[A-Za-z0-9\-]/.test(character)) {
				break;
			}

			token += character;

			this.index++;
		}

		character = this.string[this.index];

		// See note above regarding < and >.
		if (character === '>') {
			this.index++;
		}

		// Underscores are not allowed in ABNF rule names, but hyphens are.
		// But, it's more convenient for us to use underscores within a JS
		// environment, since people can specify identifiers using them.
		token = token.replace(/-/g, '_');

		// Create a new node to hold the rule reference.
		var node = (new Node())
			.setString(this.getString())
			.setPosition(start_position)
			.setLength(this.index - start_position)
			.setRuleName(token);

		this.addChildNode(node);

		return this;
	}

	/**
	 * Convenience method to determine whether this node should be treated
	 * as optional or not. If there are 0 required repeats, it's optional.
	 *
	 * @returns {boolean}
	 */
	isOptional() {
		if (this.getMinRepeats() === 0) {
			return true;
		}

		if (!this.hasChildNodes()) {
			return false;
		}

		var
			child_nodes = this.getChildNodes(),
			index       = 0;

		while (index < child_nodes.length) {
			let child_node = child_nodes[index];

			if (!child_node.isOptional()) {
				return false;
			}

			index++;
		}

		return true;
	}

	/**
	 * Just the inverse of the above.
	 *
	 * @returns {boolean}
	 */
	isRequired() {
		return !this.isOptional();
	}

	/**
	 * Store the fact that this node should be treated as optional.
	 *
	 * @returns {self}
	 */
	setIsOptional() {
		return this.setMinRepeats(0);
	}

	/**
	 * Set the minimum number of repetitions that are required for this node
	 * per its ABNF specification. Passing 0 here makes the node optional.
	 *
	 * @param   {int} min_repeats
	 * @returns {self}
	 */
	setMinRepeats(min_repeats) {
		this.min_repeats = min_repeats;
		return this;
	}

	/**
	 * Set the maximum number of allowed repetitions for this node.
	 *
	 * @param   {int} max_repeats
	 * @returns {self}
	 */
	setMaxRepeats(max_repeats) {
		this.max_repeats = max_repeats;
		return this;
	}

	/**
	 * Retrieve the minimum number of required repetitions for this node.
	 *
	 * @returns {int}
	 */
	getMinRepeats() {
		return this.min_repeats;
	}

	/**
	 * Retrieve the maximum number of allowed repetitions for this node.
	 *
	 * @returns {int}
	 */
	getMaxRepeats() {
		return this.max_repeats;
	}

	/**
	 * Convenience method to determine whether this node should be allowed
	 * to repeat.
	 *
	 * @returns {boolean}
	 */
	isRepeating() {
		return this.getMaxRepeats() > 1;
	}

	/**
	 * Sometimes during the ABNF parsing and recursive enumeration of child
	 * nodes, we end up with "artifact" nodes that are merely wrappers around
	 * a single child node, with no other modifiers. This method determines
	 * when that's the case.
	 *
	 * @returns {boolean}
	 */
	isEmptyWrapper() {
		if (!this.hasChildNodes()) {
			return false;
		}

		if (!this.hasOneChildNode()) {
			return false;
		}

		if (this.isRepeating()) {
			return false;
		}

		if (this.isOptional()) {
			return false;
		}

		return true;
	}

	/**
	 * Return the first child node for this node, if one exists.
	 *
	 * @returns {lib/node}
	 */
	getFirstChildNode() {
		return this.getChildNodes()[0];
	}

	/**
	 * Returns whether this node contains one, and only one, child node.
	 *
	 * @returns {boolean}
	 */
	hasOneChildNode() {
		if (!this.hasChildNodes()) {
			return false;
		}

		return this.getChildNodes().length === 1;
	}

	/**
	 * Add a child to the list of children for this node.
	 *
	 * @param   {lib/node} child_node
	 * @returns {self}
	 */
	addChildNode(child_node) {
		if (child_node.isEmptyWrapper()) {
			child_node = child_node.getFirstChildNode();
		}

		if (this.hasQueuedRepeat()) {
			child_node = this.applyQueuedRepeatToChildNode(child_node);
		}

		if (!this.hasChildNodes()) {
			this.resetChildNodes();
		}

		child_node.setParent(this);

		this.getChildNodes().push(child_node);
		return this;
	}

	getChildNodeByIndex(index) {
		return this.getChildNodes()[index] || null;
	}

	setQueuedRepeat(queued_repeat) {
		this.queued_repeat = queued_repeat;
		return this;
	}

	getQueuedRepeat() {
		return this.queued_repeat;
	}

	clearQueuedRepeat() {
		return this.setQueuedRepeat(null);
	}

	hasQueuedRepeat() {
		return this.getQueuedRepeat() !== null;
	}

	applyQueuedRepeatToChildNode(child_node) {
		var queued_repeat = this.getQueuedRepeat();

		queued_repeat.addChildNode(child_node);

		this.clearQueuedRepeat();

		return queued_repeat;
	}

	setQuotedString(quoted_string) {
		this.quoted_string = quoted_string;
		return this;
	}

	getQuotedString() {
		return this.quoted_string;
	}

	hasQuotedString() {
		return this.getQuotedString() !== null;
	}

	getChildNodes() {
		return this.child_nodes;
	}

	setChildNodes(child_nodes) {
		this.child_nodes = child_nodes;
	}

	resetChildNodes() {
		this.setChildNodes([ ]);
	}

	hasChildNodes() {
		return this.child_nodes !== null;
	}

	hasAlternatives() {
		return this.has_alternatives;
	}

	setHasAlternatives(has_alternatives = true) {
		this.has_alternatives = has_alternatives;
		return this;
	}

	groupChildNodes() {
		var node = new Node();

		node.setChildNodes(this.getChildNodes());

		var first_child = this.getFirstChildNode();

		node.setPosition(first_child.getPosition());
		node.setString(this.getString());

		this.resetChildNodes();

		if (this.hasQueuedRepeat()) {
			throw new Error('wat');
		}

		return this.addChildNode(node);
	}

	setRuleName(rule_name) {
		this.rule_name = rule_name;
		return this;
	}

	getRuleName() {
		return this.rule_name;
	}

	hasRuleName() {
		return this.getRuleName() !== null;
	}

	getRule() {
		var rule_name = this.getRuleName();

		try {
			return this.getRuleByName(rule_name);
		} catch (error) {
			if (error instanceof RuleNotFoundError) {
				throw new RuleNotFoundError(rule_name, null, this);
			}
		}
	}

	setParentRuleName(parent_rule_name) {
		this.parent_rule_name = parent_rule_name;
		return this;
	}

	getParentRuleName() {
		return this.parent_rule_name;
	}

	hasParentRuleName() {
		return this.getParentRuleName() !== null;
	}

	setNumericStartToken(start_token) {
		var value = this.getDecimalValueForNumericTokenAndBase(
			start_token,
			this.getNumericBase()
		);

		return this.setNumericStartValue(value);
	}

	setNumericEndToken(end_token) {
		var value = this.getDecimalValueForNumericTokenAndBase(
			end_token,
			this.getNumericBase()
		);

		return this.setNumericEndValue(value);
	}

	setNumericStartValue(start_value) {
		this.numeric_start_value = start_value;
		return this;
	}

	getNumericStartValue() {
		return this.numeric_start_value;
	}

	hasNumericStartValue() {
		return this.getNumericStartValue() !== null;
	}

	setNumericEndValue(end_value) {
		this.numeric_end_value = end_value;
		return this;
	}

	getNumericEndValue() {
		return this.numeric_end_value;
	}

	setNumericBase(numeric_base) {
		this.numeric_base = numeric_base;
		return this;
	}

	getNumericBase() {
		return this.numeric_base;
	}

	hasNumericRange() {
		return this.hasNumericStartValue();
	}

	hasNumericSet() {
		return this.getNumericSet() !== null;
	}

	getNumericSet() {
		return this.numeric_set;
	}

	addNumericSetToken(set_token) {
		if (!this.numeric_set) {
			this.numeric_set = [ ];
		}

		var value = this.getDecimalValueForNumericTokenAndBase(
			set_token,
			this.getNumericBase()
		);

		this.numeric_set.push(value);
	}

	hasNumeric() {
		return this.hasNumericRange() || this.hasNumericSet();
	}

	toJSON(recursive = false, seen_nodes) {
		if (!seen_nodes) {
			seen_nodes = [ ];
		}

		seen_nodes.push(this.getId());

		var result = { };

		if (this.isOptional()) {
			result.is_optional = true;
		}

		if (this.isRepeating()) {
			result.min_repeats = this.min_repeats;
			result.max_repeats = this.max_repeats;
		}

		if (this.hasQuotedString()) {
			result.quoted_string = this.quoted_string;
		}

		if (this.hasNumericRange()) {
			result.numeric_start_value = this.numeric_start_value;
			result.numeric_end_value = this.numeric_end_value;
		}

		if (this.hasNumericSet()) {
			result.numeric_set = this.numeric_set;
		}

		if (this.hasAlternatives()) {
			result.has_alternatives = true;
		}

		if (this.hasRuleName()) {
			result.rule_name = this.getRuleName();

			let
				linked_node    = this.getRule().getNode(),
				linked_node_id = linked_node.getId();

			if (seen_nodes.indexOf(linked_node_id) !== -1) {
				result.linked_node = '[circular]';
			} else if (recursive) {
				result.linked_node = linked_node.toJSON(recursive, seen_nodes);
			}
		}

		if (this.hasChildNodes()) {
			result.child_nodes = this.getChildNodes().map(function map(child_node) {
				let child_node_id = child_node.getId();

				if (seen_nodes.indexOf(child_node_id) !== -1) {
					return '[circular]';
				} else {
					return child_node.toJSON(recursive, seen_nodes);
				}
			});
		}

		return result;
	}

	getRuleByName(rule_name) {
		if (!rule_name) {
			throw new Error('Must specify a rule name');
		}

		if (this.isCoreRuleName(rule_name)) {
			return this.getCoreRuleList().getRuleByName(rule_name);
		}

		return this.getRuleList().getRuleByName(rule_name);
	}

	isCoreRuleName(rule_name) {
		if (rule_name !== rule_name.toUpperCase()) {
			return false;
		}

		var core_rules = this.getCoreRuleList();

		if (!core_rules) {
			return false;
		}

		return core_rules.hasRuleName(rule_name);
	}

	isCoreRule() {
		return this.isCoreRuleName(this.getRuleName());
	}

	getCoreRuleList() {
		return Core.getRuleList();
	}

	/**
	 * Retrieve the rule list for this node.
	 *
	 * @returns {lib/rule-list}
	 */
	getRuleList() {
		return this.rule_list;
	}

	/**
	 * Sets the rule list for this node.
	 *
	 * @param   {lib/rule-list} rule_list
	 * @returns {self}
	 */
	setRuleList(rule_list) {
		this.rule_list = rule_list;

		return this;
	}

	/**
	 * Sets the rule list for this node, and any child nodes, recursively.
	 *
	 * @param   {lib/rule-list} rule_list
	 * @returns {self}
	 */
	setRuleListRecursive(rule_list) {
		this.setRuleList(rule_list);

		if (this.hasChildNodes()) {
			this.getChildNodes().forEach(function each(child_node) {
				child_node.setRuleListRecursive(rule_list);
			});
		}

		return this;
	}

	/**
	 * Sets the parent node for this node.
	 *
	 * @param   {lib/node} parent_node
	 * @returns {self}
	 */
	setParent(parent_node) {
		this.parent = parent_node;
		return this;
	}

	/**
	 * Returns the parent of this node, if one exists.
	 *
	 * @returns {lib/node|null}
	 */
	getParent() {
		return this.parent;
	}

	/**
	 * Returns whether or not this node has a parent.
	 *
	 * @returns {boolean}
	 */
	hasParent() {
		return this.getParent() !== null;
	}

	/**
	 * Whether or not this node corresponds to a fixed value (ie, a quoted
	 * string, or a numeric literal with only one possible character value).
	 *
	 * @returns {boolean}
	 */
	hasFixedValue() {
		return this.getFixedValue() !== null;
	}

	/**
	 * If this node corresponds to a fixed value string representation,
	 * return that string.
	 *
	 * @returns {string|null}
	 */
	getFixedValue() {
		if (this.hasQuotedString()) {
			return this.getQuotedString();
		}

		if (this.hasFixedNumericValue()) {
			return this.getFixedNumericValue();
		}

		if (!this.hasOneChildNode()) {
			return null;
		}

		if (!this.isEmptyWrapper()) {
			return null;
		}

		return this.getFirstChildNode().getFixedValue();
	}

	/**
	 * Whether this node has a fixed (single character) numeric value.
	 *
	 * @returns {boolean}
	 */
	hasFixedNumericValue() {
		if (this.hasNumericRange()) {
			return this.getNumericStartValue() === this.getNumericEndValue();
		}

		if (this.hasNumericSet()) {
			return this.getNumericSet().length === 1;
		}

		return false;
	}

	/**
	 * Return the string representation of this node's single-character
	 * numeric value, or null if this node doesn't represent a single character.
	 *
	 * @returns {string|null}
	 */
	getFixedNumericValue() {
		if (this.hasNumericRange()) {
			return String.fromCharCode(this.getNumericStartValue());
		}

		if (this.hasNumericSet()) {
			let set = this.getNumericSet();

			return String.fromCharCode(set[0]);
		}

		return null;
	}

	generateRegexString(seen_rules, group_names, simple, star_height) {
		var result;

		// Create a copy of the rules array that we use to check for circular
		// rule structures. This prevents the issue of the same array reference
		// being passed around horizontally across the descendents of the tree;
		// we don't want false positives from rule references in adjacent
		// siblings or their descendents, so pass a unique reference to each.
		if (seen_rules) {
			seen_rules = seen_rules.slice();
		} else {
			seen_rules = [ ];
		}

		if (!group_names && !simple) {
			group_names = [ ];
		}

		if (star_height === undefined) {
			star_height = 0;
		}

		if (this.hasFixedValue()) {
			if (this.hasRuleName() && !simple) {
				result = this.generateRegexStringViaRuleName(
					seen_rules,
					null,
					true,
					star_height
				);

				if (!this.isCoreRule()) {
					result = '(' + result + ')';
					group_names.push(this.getRuleName());
				}
			} else {
				result = this.generateRegexStringViaFixedValue();
			}
		} else if (this.isEmptyWrapper()) {
			result = this.getFirstChildNode().generateRegexString(
				seen_rules,
				group_names,
				simple,
				star_height
			);
		} else if (this.hasRuleName()) {
			result = this.generateRegexStringViaRuleName(
				seen_rules,
				null,
				true,
				star_height
			);

			if (!simple && !this.isCoreRule()) {
				result = '(' + result + ')';
				group_names.push(this.getRuleName());
			}
		} else if (this.hasNumeric()) {
			result = this.generateRegexStringViaNumeric();
		} else if (this.isRepeating()) {
			result = this.generateRegexStringViaRepetition(
				seen_rules,
				group_names,
				simple,
				star_height
			);
		} else if (this.hasChildNodes()) {
			result = this.generateRegexStringViaChildren(
				seen_rules,
				group_names,
				simple,
				star_height
			);
		} else {
			throw new Error('wat');
		}

		return result;
	}

	generateRegexStringViaFixedValue() {
		return this.escapeRegexValue(this.getFixedValue());
	}

	generateRegexStringViaRuleName(seen_rules, group_names, simple, star_height) {
		var rule = this.getRule();

		if (simple && rule.hasSimpleRegexString()) {
			return rule.getSimpleRegexString();
		}

		if (!simple && rule.hasRegexString()) {
			return rule.getRegexString();
		}

		var rule_name = this.getRuleName();

		if (contains(seen_rules, rule_name)) {
			throw new CircularRuleReferenceError(null, this);
		}

		seen_rules.push(rule_name);

		return rule.getNode().generateRegexString(seen_rules, group_names, simple, star_height);
	}

	generateRegexStringViaNumeric() {
		if (this.hasNumericRange()) {
			return this.generateRegexStringViaNumericRange();
		} else {
			return this.generateRegexStringViaNumericSet();
		}
	}

	generateRegexStringViaNumericRange() {
		var
			start_character = String.fromCharCode(this.getNumericStartValue()),
			end_character   = String.fromCharCode(this.getNumericEndValue());

		start_character = this.escapeRegexValue(start_character);
		end_character = this.escapeRegexValue(end_character);

		return `[${start_character}-${end_character}]`;
	}

	generateRegexStringViaNumericSet() {
		var characters = this.getNumericSet().map(function map(value) {
			var character = String.fromCharCode(value);

			return this.escapeRegexValue(character);
		}, this);

		return characters.join('');
	}

	generateRegexStringViaRepetition(seen_rules, group_names, simple, star_height) {
		star_height++;

		var
			child            = this.getFirstChildNode(),
			group_names_copy = group_names ? group_names.slice() : null;

		var child_regex = child.generateRegexString(
			seen_rules,
			group_names_copy,
			simple,
			star_height
		);

		if (!simple && group_names.length !== group_names_copy.length) {
			throw new CircularRuleReferenceError(null, this);
		}

		var
			min_repeats = this.getMinRepeats(),
			max_repeats = this.getMaxRepeats();

		if (max_repeats === Infinity) {
			if (star_height > 1) {
				throw new Error('die');
			}

			if (min_repeats === 1) {
				return '(?:' + child_regex + ')+';
			}

			if (min_repeats === 0) {
				return '(?:' + child_regex + ')*';
			}

			max_repeats = '';
		}

		if (min_repeats === max_repeats) {
			return '(?:' + child_regex + `){${min_repeats}}`;
		}

		return '(?:' + child_regex + `){${min_repeats},${max_repeats}}`;
	}

	generateRegexStringViaChildren(seen_rules, group_names, simple, star_height) {
		var child_regexes = this.getChildNodes().map(function map(child) {
			return child.generateRegexString(seen_rules, group_names, simple, star_height);
		});

		if (this.hasAlternatives()) {
			return '(?:' + child_regexes.join('|') + ')';
		} else {
			return child_regexes.join('');
		}
	}

	escapeRegexValue(value) {
		return value.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
	}

}

extend(Node.prototype, {
	// @param {int}
	id:                  null,

	// @param {string}
	string:              null,

	// @param {int}
	position:            0,

	// @param {int}
	length:              0,

	// @param {int}
	index:               0,

	// @param {int}
	min_repeats:         1,

	// @param {int}
	max_repeats:         1,

	// @param {lib/node}
	queued_repeat:       null,

	// @param {string}
	quoted_string:       null,

	// @param {lib/node[]}
	child_nodes:         null,

	// @param {boolean}
	has_alternatives:    false,

	// @param {string}
	rule_name:           null,

	// @param {string}
	parent_rule_name:    null,

	// @param {lib/rule-list}
	rule_list:           null,

	// @param {lib/rule-list}
	core_rule_list:      null,

	// @param {int}
	numeric_start_value: null,

	// @param {int}
	numeric_end_value:   null,

	// @param {string}
	numeric_base:        null,

	// @param {int[]}
	numeric_set:         null,

	// @param {lib/node}
	parent:              null

});


/**
 * Convenience method to create a new parsed node directly from an ABNF string.
 *
 * @param   {string} string
 * @returns {lib/node}
 */
Node.fromString = function fromString(string) {
	return (new Node())
		.setString(string)
		.setLength(string.length)
		.parse();
};

module.exports = Node;
