import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expandWeeks, nameKey, normalizeEmail, roomKey, threshold, tierOf } from '../src/rules.ts';

test('邮箱：只收 QQ、163、Gmail，Gmail 去点和 + 后缀', () => {
  assert.equal(normalizeEmail(' Foo.Bar+x@Gmail.com '), 'foobar@gmail.com');
  assert.equal(normalizeEmail('a.b@googlemail.com'), 'ab@gmail.com');
  assert.equal(normalizeEmail('12345@qq.com'), '12345@qq.com');
  assert.equal(normalizeEmail('x.y@163.com'), 'x.y@163.com');
  assert.equal(normalizeEmail('a@outlook.com'), null);
  assert.equal(normalizeEmail('not-an-email'), null);
});

test('档位：导入直接是同学，手动要 20 分，负分回到新同学', () => {
  assert.equal(tierOf(0, true), 'member');
  assert.equal(tierOf(0, false), 'newbie');
  assert.equal(tierOf(20, false), 'member');
  assert.equal(tierOf(60, false), 'helper');
  assert.equal(tierOf(120, true), 'trusted');
  assert.equal(tierOf(-5, true), 'newbie');
  assert.equal(tierOf(200, true, true), 'newbie');
});

test('门槛：按人数比例，夹在上下限之间', () => {
  assert.equal(threshold('confirm', 0), 2);
  assert.equal(threshold('confirm', 30), 3);
  assert.equal(threshold('confirm', 200), 5);
  assert.equal(threshold('postpone', 30), 5);
  assert.equal(threshold('postpone', 10), 3);
  assert.equal(threshold('duplicate', 100), 3);
});

test('课名和教室规整', () => {
  assert.equal(nameKey('【调】数字政府与社会▲'), nameKey('数字政府与社会'));
  assert.equal(roomKey('通博楼 B101'), roomKey('通博楼B101'));
  assert.equal(roomKey('讲座场地'), '');
  assert.equal(roomKey(''), '');
});

test('周次展开：多段、单双周', () => {
  assert.deepEqual(expandWeeks([{ from: 1, to: 5, rule: 'all' }, { from: 7, to: 9, rule: 'all' }]), [1, 2, 3, 4, 5, 7, 8, 9]);
  assert.deepEqual(expandWeeks([{ from: 7, to: 13, rule: 'odd' }]), [7, 9, 11, 13]);
  assert.deepEqual(expandWeeks([{ from: 1, to: 6, rule: 'even' }]), [2, 4, 6]);
});
