---
title: Fiber hinges at a portal base
description: An elastic portal on fiber zeroLengthSection hinges, one of them written with reversed nodes and -orient.
features: zeroLengthSection, -orient, Concrete01, Steel01
---

An elastic portal frame stands on two reinforced concrete fiber hinges (`zeroLengthSection`). The left hinge has its local x up the column. The right one is written top to bottom, with its nodes reversed and `-orient` pointing down. The two must behave the same.

Gravity is held while the frame is pushed sideways until the hinges yield. A 2D section resists axial force and bending only, so the column bases are held horizontally.
