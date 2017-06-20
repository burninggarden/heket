
var
	Heket = require('../index');


function unparseValid(test) {
	test.expect(9);

	var spec = `
		foo = 1*bar *(" " baz) [wat]
		bar = "bam"
		baz = "bal"
		wat = "WAT"
	`;

	var unparser = Heket.createUnparser(spec);

	var
		bar_index = 0,
		baz_index = 0;

	var string = unparser.unparse(function getRuleValue(rule_name, index) {
		switch (rule_name) {
			case 'bar':
				if (bar_index < 5) {
					test.equals(bar_index, index);
					bar_index++;
					return 'bam';
				}

				return null;

			case 'baz':
				if (baz_index < 3) {
					test.equals(baz_index, index);
					baz_index++;
					return 'bal';
				}

				return null;

			case 'wat':
			default:
				return null;
		}
	});

	test.equals(string, 'bambambambambam bal bal bal');
	test.done();
}

function unparseWithMissingRule(test) {
	test.expect(2);

	var spec = `
		foo = 1*bar [baz]
		bar = "bar"
		baz = "baz"
	`;

	var unparser = Heket.createUnparser(spec);

	try {
		unparser.unparse(function getRuleValue(rule_name) {
			switch (rule_name) {
				case 'baz':
					return 'baz';

				case 'bar':
				default:
					return null;
			}
		});
	} catch (error) {
		test.ok(error instanceof Heket.MissingRuleValueError);
		test.ok(error.getRuleName() === 'bar');
	}

	test.done();
}

function unparseWithInvalidRule(test) {
	test.expect(3);

	var spec = `
		foo = 1*bar [baz]
		bar = "bar"
		baz = "baz"
	`;

	var
		unparser  = Heket.createUnparser(spec),
		bar_count = 0;

	try {
		let res = unparser.unparse(function getRuleValue(rule_name) {
			switch (rule_name) {
				case 'bar':
					if (bar_count < 2) {
						bar_count++;
						return 'bar';
					}

					return null;

				case 'baz':
					return 'zap';

				default:
					return null;

			}
		});

		console.log(res);

		test.ok(false, 'We should not be here');
	} catch (error) {
		test.ok(error instanceof Heket.InvalidRuleValueError);
		test.ok(error.getRuleName() === 'baz');
		test.ok(error.getRuleValue() === 'zap');
	}

	test.done();
}

function parseAndUnparse(test) {
	test.expect(1);

	var
		spec     = Heket.readABNFFile('irc'),
		parser   = Heket.createParser(spec),
		input    = ':pachet!pachet@burninggarden.com PRIVMSG #ops :Test message\n',
		match    = parser.parse(input),
		unparser = parser.getUnparser(),
		output   = unparser.unparse(match.getNext);

	test.equals(input, output);
	test.done();
}

function unparseWithRuleMap(test) {
	test.expect(1);

	var spec = `
		foo = 1*bar *(" " baz) [wat]
		bar = "bam"
		baz = "bal"
		wat = "WAT"
	`;

	var unparser = Heket.createUnparser(spec);

	var string = unparser.unparse({
		bar: ['bam', 'bam', 'bam', 'bam', 'bam'],
		baz: ['bal', 'bal', 'bal'],
		wat: [ ]
	});

	test.equals(string, 'bambambambambam bal bal bal');
	test.done();
}

function unparseWithShorthandMap(test) {
	test.expect(1);

	var spec = `
		foo = 1*bar *(" " baz) [wat]
		bar = "bam"
		baz = "bal"
		wat = "WAT"
	`;

	var unparser = Heket.createUnparser(spec);

	var string = unparser.unparse({
		// Notice how this value is not wrapped in an array:
		bar: 'bam',
		baz: ['bal', 'bal', 'bal'],
		wat: [ ]
	});

	test.equals(string, 'bam bal bal bal');
	test.done();
}

module.exports = {
	unparseValid,
	unparseWithMissingRule,
	unparseWithInvalidRule,
	parseAndUnparse,
	unparseWithRuleMap,
	unparseWithShorthandMap
};
