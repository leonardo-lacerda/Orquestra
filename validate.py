from html.parser import HTMLParser

class Validator(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []
        self.stack = []
        self.void = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
    def handle_starttag(self, tag, attrs):
        if tag not in self.void:
            self.stack.append(tag)
    def handle_endtag(self, tag):
        if tag in self.void:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        else:
            self.errors.append(f'Mismatched </{tag}> (expected </{self.stack[-1] if self.stack else "?"}>)')

with open('landing-1-maestri-style.html','r',encoding='utf-8') as f:
    content = f.read()

v = Validator()
v.feed(content)
if v.stack:
    print(f'Unclosed tags: {v.stack}')
elif v.errors:
    for e in v.errors: print(e)
else:
    print('HTML structure valid - all tags properly closed')

checks = {
    'Google Fonts Inter': 'fonts.googleapis.com' in content,
    'Nav pill': 'nav-pill' in content,
    'Hero heading': 'Seu c\u00f3digo. Seu espa\u00e7o. Sua regra.' in content,
    'App icon 3D': 'app-icon-3d' in content,
    'Terminal dots': 'icon-dots' in content,
    'Mac window': 'mac-window' in content,
    'Sidebar tree': 'mac-sidebar' in content,
    'Canvas grid': 'canvas-grid' in content,
    'Float panels': 'float-panel' in content,
    'Feature cards': 'feature-card' in content,
    'Footer': '<footer>' in content,
    'Responsive': '@media' in content,
    'Comece de graca': 'Comece de gra' in content,
    'Baixar button': 'nav-cta' in content,
}
print()
for name, ok in checks.items():
    status = 'OK' if ok else 'FAIL'
    print(f'  [{status}] {name}')
passed = sum(1 for v in checks.values() if v)
print(f'\n{passed}/{len(checks)} checks pass')
print(f'File size: {len(content):,} bytes')
