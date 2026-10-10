# Third-party notices

## SpinKit — Flow

PiScope vendors only SpinKit's three-dot **Flow** component in `public/style.css`,
not the full spinner collection or a JavaScript bundle. The earlier Bootstrap
spinner-grow component has been removed.

Source pinned to commit `742a71277c49b69053b5beb9fad80d720840a2ab`:
https://github.com/tobiasahlin/SpinKit/blob/742a71277c49b69053b5beb9fad80d720840a2ab/spinkit.css

Adaptations: scope selectors to `.running-icon`, prefix the keyframe name, use a
2rem × 1rem reserved slot with three circular .5rem dots, use the existing green
color and Running accessible label, retain the source's stagger/easing while
slowing the cycle from 1.4s to 1.5s, and stop motion for inactive/collapsed rows or
reduced motion. No CDN, runtime npm dependency, or frontend build is required.
The full license notice is also preserved in the CSS.

```text
The MIT License (MIT)

Copyright (c) 2020 Tobias Ahlin

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
