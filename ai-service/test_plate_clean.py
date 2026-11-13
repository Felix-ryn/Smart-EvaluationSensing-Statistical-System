"""Self-check for plate normalization/validation helpers (no test framework).

Run: python test_plate_clean.py
"""
import importlib.util
import re
import sys
import os
import ast

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "main.py"), encoding="utf-8").read()
tree = ast.parse(src)

# Extract regexes and functions
scope = {"re": re}
for node in tree.body:
    if isinstance(node, ast.Assign):
        targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if any(n in ("_EXPIRY_RE", "_PLATE_RE", "_PLATE_EXTRACT_RE") for n in targets):
            code = compile(ast.Module(body=[node], type_ignores=[]), "main.py", "exec")
            exec(code, scope)
    if isinstance(node, ast.FunctionDef) and node.name in (
        "clean_plate_text",
        "_valid_plate_format",
        "select_main_plate_line",
        "extract_plate",
    ):
        code = compile(ast.Module(body=[node], type_ignores=[]), "main.py", "exec")
        exec(code, scope)

clean = scope["clean_plate_text"]
valid = scope["_valid_plate_format"]
select_main = scope["select_main_plate_line"]
extract_plate = scope.get("extract_plate")

# Test clean_plate_text
cases = [
    ("B 5857 FFT 11.31", "B 5857 FFT", True),
    ("B 5857 FFT 11-31", "B 5857 FFT", True),
    ("B 5857 FFT 11 31", "B 5857 FFT", True),
    ("B5857FFT", "B5857FFT", True),
    ("B 5857 FFT", "B 5857 FFT", True),
    ("AB 1234 XYZ", "AB 1234 XYZ", True),
    ("AB 1234", "AB 1234", True),
    ("1234", "1234", False),  # no region letters -> invalid
    ("B 5857 FFT 11.31", "B 5857 FFT", True),
]

for raw, expected, exp_valid in cases:
    got = clean(raw)
    assert got == expected, f"clean({raw!r}) = {got!r}, expected {expected!r}"
    assert valid(got) == exp_valid, f"valid({got!r}) = {valid(got)}, expected {exp_valid}"

print(f"OK: {len(cases)} cases passed")

# Test select_main_plate_line with split plate
split_lines = [
    {"text": "F", "confidence": 0.9, "height": 40, "center_y": 100, "x_center": 30},
    {"text": "2022", "confidence": 0.9, "height": 40, "center_y": 100, "x_center": 90},
    {"text": "OK", "confidence": 0.9, "height": 40, "center_y": 100, "x_center": 160},
    {"text": "28-22", "confidence": 0.9, "height": 12, "center_y": 200, "x_center": 90},
]
joined = select_main(split_lines)
assert joined == "F 2022 OK", f"select_main(split) = {joined!r}, expected 'F 2022 OK'"
assert valid(clean(joined)), f"cleaned split plate invalid: {clean(joined)!r}"

print("OK: split-plate row selection passed")

# Test select_main_plate_line with empty lines
empty_lines = []
try:
    result = select_main(empty_lines)
    assert result == "", f"select_main([]) = {result!r}, expected ''"
except Exception as e:
    raise AssertionError(f"select_main([]) raised {type(e).__name__}: {e}")

print("OK: empty lines (no geometry) passed")

# Test extract_plate
if extract_plate:
    # Test 1: HONDA H2325 PI 03·25 -> H 2325 PI
    assert extract_plate(["HONDA", "H2325", "PI", "03·25"]) == "H 2325 PI", "extract_plate test 1 failed"
    
    # Test 2: H 2325 PI 03·25 -> H 2325 PI
    assert extract_plate(["H 2325 PI", "03·25"]) == "H 2325 PI", "extract_plate test 2 failed"
    
    # Test 3: B 5857 FFT 11.31 -> B 5857 FFT
    assert extract_plate(["B 5857 FFT 11.31"]) == "B 5857 FFT", "extract_plate test 3 failed"
    
    # Test 4: split plate F 2022 OK 28-22 -> F 2022 OK
    assert extract_plate(["F", "2022", "OK", "28-22"]) == "F 2022 OK", "extract_plate test 4 failed"
    
    # Test 5: HONDA (no digits/no full pattern) -> None
    assert extract_plate(["HONDA"]) is None, "extract_plate test 5 failed"
    
    print("OK: 5 extract_plate tests passed")
else:
    print("WARNING: extract_plate not found, skipping tests")
