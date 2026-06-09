"""
01 — Hello World
================

The smallest possible BitSage function. Port of Modal's getting-started
tutorial: same shape, same runtime contract, one different import.

Run it:

.. code-block:: shell

    bitsage setup                       # one-time: store your API key
    bitsage run examples/01_hello_world.py::hello

Equivalent Modal code for comparison:

.. code-block:: python

    import modal
    app = modal.App("hello")

    @app.function()
    def hello() -> str:
        return "Hello from Modal"

The only diff is ``import bitsage`` + ``tier="cpu_standard"``. That's
deliberate — Modal tutorials should port across with a find-replace.
"""

import bitsage

app = bitsage.App("hello")


@app.function(tier="cpu_standard", timeout=30)
def hello() -> str:
    return "Hello from BitSage"


if __name__ == "__main__":
    # Let the file run as a script too — local call, no round-trip:
    print(hello())
