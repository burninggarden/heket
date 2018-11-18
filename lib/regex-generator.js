
class RegexGenerator {

	/**
	 * @param   {lib/node} node
	 * @returns {lib/regex-generator}
	 */
	setNode(node) {
		this.node = node;
		return this;
	}

	/**
	 * @returns {lib/node}
	 */
	getNode() {
		return this.node;
	}

	setSeenRules(seen_rules) {
		this.seen_rules = seen_rules;
		return this;
	}

	getSeenRules() {
		return this.seen_rules;
	}

	copySeenRules() {
		return this.getSeenRules().slice();
	}

	setGroupNames(group_names) {
		this.group_names = group_names;
		return this;
	}

	getGroupNames() {
		return this.group_names;
	}

	copyGroupNames() {
		return this.getGroupNames().slice();
	}

	setIsSimpleMode(is_simple_mode) {
		this.is_simple_mode = is_simple_mode;
		return this;
	}

	getSimpleMode() {
		return this.is_simple_mode;
	}

	setStarHeight(star_height) {
		this.star_height = star_height;
		return this;
	}

	getStarHeight() {
		return this.star_height;
	}

	/**
	 * @returns {string|null}
	 */
	generate() {
		var node = this.getNode();

		if (node.hasFixedValue()) {
			return this.generateViaFixedValue();
		}

		if (node.isEmptyWrapper()) {
			return this.generateViaEmptyWrapper();
		}

		if (node.hasRuleName()) {
			return this.generateViaRuleName();
		}

		if (node.hasNumeric()) {
			return this.generateViaNumeric();
		}

		if (node.isRepeating()) {
			return this.generateViaRepetition();
		}

		if (node.hasChildNodes()) {
			return this.generateViaChildren();
		}

		throw new Error('Unable to parse node');
	}

	/**
	 * @param   {lib/node} node
	 * @returns {string}
	 */
	generateViaNode(node) {
		return (new RegexGenerator())
			.setNode(node)
			.setSeenRules(this.copySeenRules())
			.setGroupNames(this.getGroupNames())
			.setIsSimpleMode(this.isSimpleMode())
			.setStarHeight(this.getStarHeight())
			.generate();
	}

	generateViaFixedValue() {
	}

	generateViaEmptyWrapper() {
		var node = this.getNode().getFirstChildNode();

		return this.generateViaNode(node);
	}

	generateViaNumeric() {
		if (this.getNode().hasNumericRange()) {
			return this.generateViaNumericRange();
		} else {
			return this.generateViaNumericSet();
		}
	}

	generateViaNumericRange() {
		var
			node            = this.getNode(),
			start_character = String.fromCharCode(node.getNumericStartValue()),
			end_character   = String.fromCharCode(node.getNumericEndValue());

		start_character = this.escapeRegexValue(start_character);
		end_character = this.escapeRegexValue(end_character);

		return `[${start_character}-${end_character}]`;
	}

	generateViaNumericSet() {
		var node = this.getNode();

		var characters = node.getNumericSet().map(function map(value) {
			var character = String.fromCharCode(value);

			return this.escapeRegexValue(character);
		}, this);

		return characters.join('');
	}

	generateViaRepetition() {
		this.star_height++;

		var
			node             = this.getNode(),
			child            = node.getFirstChildNode(),
			group_names_copy = group_names ? group_names.slice() : null;

		var child_regex = this.generateViaNode(child);

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
			min_repeats = node.getMinRepeats(),
			max_repeats = node.getMaxRepeats();

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

	generateViaChildren() {
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

module.exports = RegexGenerator;
