#!/usr/bin/env python3
"""Generate the updated RapidLink pitch deck from the existing visual template."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "Tshwane_RapidLink_Hackathon_Pitch.pptx"
OUTPUT = ROOT / "Tshwane_RapidLink_Updated_System_Pitch.pptx"

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"p": P, "a": A}

ET.register_namespace("p", P)
ET.register_namespace("a", A)
ET.register_namespace("r", R)


REPLACEMENTS: dict[int, dict[int, str | list[str]]] = {
    1: {
        33: "One tap. The right responder.\nVisible progress.",
        36: "WORKING PWA PROTOTYPE",
        37: "CLIENT  •  RESPONDER  •  SUPERVISOR",
    },
    2: {
        2: "A CITY-SCALE RESPONSE CHALLENGE",
        7: "4.0M",
        8: "residents across Tshwane\n(Census 2022)",
        10: "SILOS",
        11: "police, fire and ambulance operate through separate response paths",
        13: "NO VIEW",
        14: "citizens cannot see who accepted, is en route or arrived",
        17: "CURRENT FLOW",
        18: "CALL • ROUTE",
        30: "RAPIDLINK",
        31: "TAP • MATCH",
    },
    3: {
        2: "WHEN EVERY STEP ADDS DELAY",
        9: "Reporting is high-friction",
        10: "A caller must explain the incident while under stress.",
        14: "Location can be uncertain",
        15: "Coordinates and landmarks are not always shared together.",
        19: "Responder availability is hidden",
        20: "Duty status and workload may sit outside the request flow.",
        24: "Citizens lose visibility",
        25: "They cannot see acceptance, progress or closure.",
        28: "CALL",
        31: "LOCATE",
        34: "CHECK",
        37: "ASSIGN",
        40: "UPDATE",
        43: "CLOSE",
        58: "WAIT",
        59: "STATUS",
        61: "TOO MANY HANDOFFS BEFORE HELP MOVES",
    },
    4: {
        2: "ONE REQUEST. ONE SHARED RESPONSE.",
        14: "TRIGGER",
        15: "SOS or police,\nambulance or fire",
        27: "LOCATE",
        28: "GPS captured\nor refreshed",
        38: "MATCH",
        39: "Nearest compatible\nstation",
        51: "ACCEPT",
        52: "First eligible\nresponder wins",
        65: "TRACK",
        66: "En route · arrived\nclient-confirmed close",
        69: ["Installable PWA.   ", "Same-device offline.   ", "Cross-device sync online."],
    },
    5: {
        2: "PROVEN DEMAND. A DIFFERENT WORKFLOW.",
        13: "Gauteng e-Panic",
        15: "Free government panic app",
        17: "Province-wide command-centre model",
        19: "Namola",
        21: "Consumer SOS + response",
        23: "Operator-led; private response is paid",
        25: "AURA",
        27: "Embedded B2B response network",
        29: "Partner platform, not a municipal workflow",
        31: "Tshwane 107",
        33: "Toll-free emergency call",
        35: "Voice call into a communication centre",
        37: "RAPIDLINK CONNECTS THREE OPERATIONAL VIEWS:",
        38: "CLIENT • RESPONDER • SUPERVISOR",
    },
    6: {
        2: "COORDINATION IS THE DIFFERENCE",
        13: "DIRECT\nMATCHING",
        15: "Service + location create offers\nfor eligible responders",
        16: "MVP TODAY",
        29: "COMBINED\nSOS",
        31: "Police + ambulance\nfrom one action",
        32: "MVP TODAY",
        40: "DUTY-AWARE\nROUTING",
        42: "Attendance + availability\ndetermine eligibility",
        43: "MVP TODAY",
        53: "OFFLINE\nCONTINUITY",
        55: "Local workflow + queued sync\nafter reconnection",
        56: "MVP TODAY",
        66: "CONFIRMED\nCLOSURE",
        68: "Client confirms help\nbefore incident closes",
        69: "MVP TODAY",
    },
    7: {
        2: "COMMERCIALISATION & PILOT",
        3: "From Working Prototype to City Platform",
        10: "PILOT",
        11: "One station · one ward · 30 days",
        12: "Measure acceptance, progress\nand completion times",
        16: "CITY DEPLOYMENT",
        17: "Municipal platform licence",
        18: "Roster, governance and\nsystem integrations",
        22: "MULTI-METRO",
        23: "Repeatable deployment model",
        24: "Configurable stations,\nservices and policies",
        27: "CITY",
        28: "Annual platform licence",
        30: "PARTNERS",
        31: "Deployment + connectivity",
        33: "CITIZEN",
        34: "No subscription",
        36: "ONE STATION. THIRTY DAYS.",
    },
}


def replace_shape_text(root: ET.Element, shape_id: int, replacement: str | list[str]) -> None:
    for shape in root.findall(".//p:sp", NS):
        metadata = shape.find("./p:nvSpPr/p:cNvPr", NS)
        if metadata is None or int(metadata.get("id", "-1")) != shape_id:
            continue
        nodes = shape.findall(".//a:t", NS)
        if not nodes:
            raise RuntimeError(f"Shape {shape_id} contains no text")
        values = replacement if isinstance(replacement, list) else [replacement]
        if len(values) > len(nodes):
            raise RuntimeError(f"Shape {shape_id} has {len(nodes)} runs but needs {len(values)}")
        for index, node in enumerate(nodes):
            node.text = values[index] if index < len(values) else ""
        return
    raise RuntimeError(f"Shape {shape_id} was not found")


def build() -> None:
    with ZipFile(SOURCE, "r") as source, ZipFile(OUTPUT, "w", ZIP_DEFLATED) as output:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename.startswith("ppt/slides/slide") and item.filename.endswith(".xml"):
                slide_number = int(item.filename.removeprefix("ppt/slides/slide").removesuffix(".xml"))
                if slide_number in REPLACEMENTS:
                    root = ET.fromstring(data)
                    for shape_id, replacement in REPLACEMENTS[slide_number].items():
                        replace_shape_text(root, shape_id, replacement)
                    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            output.writestr(item, data)
    print(OUTPUT)


if __name__ == "__main__":
    build()
