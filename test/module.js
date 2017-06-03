
var
	Heket = require('../index');


function parseOneQuotedString(test) {
	test.expect(4);

	WithQuotedString: {
		let rules = Heket.parse(`
			foo = "xxx"
		`);

		let matching_result = rules.match('xxx');

		test.deepEqual(matching_result, {
			value: 'xxx',
			rules: { }
		});

		let non_matching_result = rules.match('xxxy');

		test.equals(non_matching_result, null);
	}

	WithRule: {
		let rules = Heket.parse(`
			foo = bar
			bar = baz
			baz = "xxx"
		`);

		let matching_result = rules.match('xxx');

		test.deepEqual(matching_result, {
			value: 'xxx',
			rules: {
				bar: {
					value: 'xxx',
					rules: {
						baz: {
							value: 'xxx',
							rules: { }
						}
					}
				}
			}
		});

		let non_matching_result = rules.match('xx');

		test.equals(non_matching_result, null);
	}

	test.done();
}

function parseTwoQuotedStrings(test) {

	test.expect(6);

	TwoRules: {
		let rules = Heket.parse(`
			foo = bar baz
			bar = "bar"
			baz = "baz"
		`);

		let matching_result = rules.match('barbaz');

		test.deepEqual(matching_result, {
			value: 'barbaz',
			rules: {
				bar: {
					value: 'bar',
					rules: { }
				},
				baz: {
					value: 'baz',
					rules: { }
				}
			}
		});

		let non_matching_result = rules.match('bar');

		test.equals(non_matching_result, null);
	}

	RuleAndQuotedString: {
		let rules = Heket.parse(`
			foo = bar "baz"
			bar = "bar"
		`);

		let matching_result = rules.match('barbaz');

		test.deepEqual(matching_result, {
			value: 'barbaz',
			rules: {
				bar: {
					value: 'bar',
					rules: { }
				}
			}
		});

		let non_matching_result = rules.match('foobaz');

		test.equals(non_matching_result, null);
	}

	RuleAndQuotedStringAlternatives: {
		let rules = Heket.parse(`
			foo = bar / "baz"
			bar = "bar"
		`);

		let matching_result = rules.match('baz');

		test.deepEqual(matching_result, {
			value: 'baz',
			rules: { }
		});

		let non_matching_result = rules.match('barbaz');

		test.equals(non_matching_result, null);
	}

	test.done();
}

function parseThreeQuotedStrings(test) {
	test.done();
}

function parseOptional(test) {
	test.expect(2);

	OptionalQuotedString: {
		let rules = Heket.parse(`
			foo = bar ["baz"]
			bar = "bar"
		`);

		let matching_result = rules.match('bar');

		test.deepEqual(matching_result, {
			value: 'bar',
			rules: {
				bar: {
					value: 'bar',
					rules: { }
				}
			}
		});
	}

	OptionalRule: {
		let rules = Heket.parse(`
			foo = bar [baz]
			bar = "bar"
			baz = "baz"
		`);

		let matching_result = rules.match('barbaz');

		test.deepEqual(matching_result, {
			value: 'barbaz',
			rules: {
				bar: {
					value: 'bar',
					rules: { }
				},
				baz: {
					value: 'baz',
					rules: { }
				}
			}
		});
	}

	test.done();
}


module.exports = {
	parseOneQuotedString,
	parseTwoQuotedStrings,
	parseThreeQuotedStrings,
	parseOptional
};