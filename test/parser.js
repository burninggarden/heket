
var
	Heket = require('../index'),
	FS    = require('fs');

function getParserForRule(test) {
	test.expect(1);

	var foo_parser = Heket.createParser(`
		foo = bar
		baz = "baz"
	`);

	var baz_parser = foo_parser.getParserForRule('baz');

	var match = baz_parser.parse('baz');

	test.deepEqual(match.getRawResult(), {
		string: 'baz',
		rules:  [ ]
	});

	test.done();
}

function multilineAlternatives(test) {
	test.expect(1);

	var parser = Heket.createParser(`
		foo =  bar
		foo =/ baz
		bar =  "bar"
		baz =  "baz"
	`);

	var match = parser.parse('baz');

	test.deepEqual(match.getRawResult(), {
		string: 'baz',
		rules:  [
			{
				rule_name: 'baz',
				string: 'baz'
			}
		]
	});

	test.done();
}

function missingRuleDefinitionWithinAlternativeClause(test) {
	test.expect(2);

	var parser = Heket.createParser(`
		foo = ( bar / baz )
		bar = bam ; Notice that bam is never defined
		baz = wat
		wat = "wat"
	`);

	// The parser should not swallow errors due to alternative expansion of
	// rules that themselves contain references to undefined rules.
	// When parsing alternative clauses, other types of errors that might be
	// thrown are normally suppressed, and the offending option bypassed.
	// This suppression should not apply to instances of RuleNotFoundError.
	try {
		parser.parse('wat');
		test.ok(false, 'We should not be here');
	} catch (error) {
		test.ok(error instanceof Heket.RuleNotFoundError);
		test.equals(error.getRuleName(), 'bam');
	}

	test.done();
}

function interstitialOptionalValue(test) {
	test.expect(1);

	var parser = Heket.createParser(`
		foo = "A" [ "B" ] "C"
	`);

	try {
		parser.parse('A');
		test.ok(false, 'We should not be here');
	} catch (error) {
		test.ok(error instanceof Heket.InputTooShortError);
	}

	test.done();
}

function twoTrailingOptionalValues(test) {
	test.expect(1);

	var parser = Heket.createParser(`
		foo = "A" [ "B" ] [ "C" ]
	`);

	var match = parser.parse('A');

	test.equals(match.getString(), 'A');
	test.done();
}

function alternativeWithinGroup(test) {
	test.expect(1);

	var parser = Heket.createParser(`
		foo = "A" / "B" ( "C" / "D" )
	`);

	var match = parser.parse('BC');

	test.equals(match.getString(), 'BC');
	test.done();
}

function coreRuleExcludedFromResults(test) {
	test.expect(1);

	var parser = Heket.createParser(`
		foo = SP bar "baz"
		bar = "bar"
	`);

	var match = parser.parse(' barbaz');

	test.equals(match.get('bar'), 'bar');
	test.done();
}

function sequentialOptionalChildren(test) {
	var parser = Heket.createParser(`
		foo = bar ( *baz / *wat )
		bar = "bar"
		baz = "baz"
		wat = "wat"
	`);

	var match = parser.parse('bar');

	test.equals(match.get('bar'), 'bar');
	test.done();
}

function avoidCatastrophicBacktracking(test) {
	Heket.disableRegexCaching();

	var XRI = FS.readFileSync('./abnf/xri/2.0.abnf', 'utf8');

	var
		parser = Heket.createParser(XRI),
		text   = '@example/(@example/foo)',
		match  = parser.parse(text);

	test.equals(match.getString(), text);

	Heket.enableRegexCaching();
	test.done();
}


module.exports = {
	getParserForRule,
	multilineAlternatives,
	missingRuleDefinitionWithinAlternativeClause,
	interstitialOptionalValue,
	twoTrailingOptionalValues,
	alternativeWithinGroup,
	coreRuleExcludedFromResults,
	sequentialOptionalChildren,
	avoidCatastrophicBacktracking
};
