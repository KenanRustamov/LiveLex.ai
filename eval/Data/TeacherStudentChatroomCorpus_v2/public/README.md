The TeacherStudent Chatroom Corpus, version 2
=======
Updated: 24 November 2022.


## Introduction

A corpus of one-to-one English lessons between teachers and students collected in an online chatroom, originally released in 2020 at the NLP4CALL workshop [1].
This second version of the corpus includes more data, new annotation and files for machine learning experiments. It will be presented at the 2022 NLP4CALL workshop [2].
Please cite at least one of the papers if you use the corpus for published research, and please let us know what interesting things you do with the data!

[1]
```
@inproceedings{tscc-nlp4call2020,
  author = {Andrew Caines and Helen Yannakoudakis and Helena Edmondson and Helen Allen and Pascual P\'{e}rez-Paredes and Bill Byrne and Paula Buttery},
  year = {2020},
  title = {The Teacher-Student Chatroom Corpus},
  booktitle = {Proceedings of Natural Language Processing for Computer-Assisted Language Learning (NLP4CALL)},
  url = {https://aclanthology.org/2020.nlp4call-1.2/}
}
```

[2]
```
@inproceedings{tscc-nlp4call2022,
  author = {Andrew Caines and Helen Yannakoudakis and Helen Allen and Pascual P\'{e}rez-Paredes and Bill Byrne and Paula Buttery},
  year = {2022},
  title = {The Teacher-Student Chatroom Corpus version 2: more lessons, new annotation, automatic detection of sequence shifts},
  booktitle = {Proceedings of Natural Language Processing for Computer-Assisted Language Learning (NLP4CALL)},
  url = {https://aclanthology.org/}
}
```


## Contents

Each tab-delimited file contains a distinct lesson between a teacher and a student where the filename is of the format: 'teacherstudentchat<NUMBER>.tsv'

The metadata file 'teacherStudentChatroomCorpusPublicMetadata.csv' corresponds to these filenames, giving information about the date of the lesson, the participants and lesson statistics.

Each row in the file represents a turn by one of the chat participants. Each row has the following data fields:

- timestamp: date and time of day;
- user.id: a unique identifier for each participant, combining their role (teacher, student or researcher) and ID number;
- role: teacher, student or researcher (as an observer occasionally);
- turn.number: from 1 to N where N is the end of the lesson, and where some turn numbers may be missing (because they were omitted in post-processing, as duplicate rows);
- anonymised: the participant's chat turn with <TEACHER> or <STUDENT> replacing real names;
- edited: the participant's chat turn with minimal grammatical error corrections;
- responding.to: which turn.number this turn is in response to, because not all turns are sequential (they may refer back to a turn at least 2 turns previous) -- where there is no value this means that the turn is in response to the previous turn.number;
- sequence: a sequence identifier, with major sequences indicated by integers, and minor sequences indicated by an integer plus a letter (e.g. 2, 2a, 2b, 2c);
- seq.type: a sequence type, from the set of possible sequence types (more information in our paper);
- focus: the skill being targeted in the current sequence, if applicable, from the set of possible focus types (more information in our paper);
- resource: where applicable, the resource being referred to in the current sequence, from the set of possible resources (more information in our paper);
- assessment: CEFR level of the student based on this chat transcription (towards the end of each file).


### Files for classification experiments

The 'sequence_shift_detection' subdirectory contains files used in the machine learning experiments discussed in the NLP4CALL 2022 paper: aiming to identify sequence shifts in the lesson transcripts.

There is a train/test split with one tab-delimited file for each. The columns are as follows:

- label: a binary 0 or 1, is a sequence shift or not after s2 (sequence 2)
- label_full: the sequence type if there is a sequence shift (or empty if not)
- s1_0prevS_0roleLabels: sequence 1 (the preceding one to sequence 2) only and no role labels for teacher and student
- s1_0prevS_1roleLabels: as above but with role labels [s] and [t] for student and teacher respectively, prefixed to each turn indicating who produced it
- s1_1prevS_0roleLabels	and s1_1prevS_1roleLabels: as above but with another preceding turn concatenated to sequence 1
- s2_0prevS_0roleLabels: sequence 2 with no preceding turns and no role labels (sequence 2 is the target turn -- given this sequence, does a new discourse sequence come after it?)
- s2_0prevS_1roleLabels: as above but with role labels
- doc_id: the source filename for this turn
- turn_num: the turn number in the lesson


### SETT annotation

The 'sett_annotation' subdirectory contains the 50 lesson transcripts which we annotated according to the SETT Framework. Please see the NLP4CALL 2022 paper for further details.


## Finally

Note that future releases may contain new lessons and new annotations: we will keep you updated with any news using the email address you registered with.
Please remember the licence you agreed to in requesting this corpus (copied below for convenience), and please get in touch with any feedback or questions.

Andrew Caines, Helen Yannakoudakis, Helen Allen, Pascual Pérez-Paredes, Paula Buttery, Bill Byrne.
University of Cambridge, King's College London, and Cambridge University Press & Assessment.
Contact: chat.corpus@cl.cam.ac.uk


---------

(1) By downloading this dataset and licence, this licence agreement is entered into, effective this date, between you, the Licensee, and the University of Cambridge, the Licensor.  (2) Copyright of the entire licensed dataset is held by the Licensor. No ownership or interest in the dataset is transferred to the Licensee.  (3) The Licensor hereby grants the Licensee a non-exclusive non-transferable right to use the licensed dataset for non-commercial research and educational purposes.  (4) Non-commercial purposes exclude without limitation any use of the licensed dataset or information derived from the dataset for or as part of a product or service which is sold, offered for sale, licensed, leased or rented.  (5) The Licensee shall acknowledge use of the licensed dataset in all publications of research based on it, in whole or in part, through citation of the following publication: Andrew Caines, Helen Yannakoudakis, Helen Allen, Pascual Pérez-Paredes, Bill Byrne and Paula Buttery. 2022. The Teacher-Student Chatroom Corpus version 2: more lessons, new annotation, automatic detection of sequence shifts. Proceedings of NLP4CALL.  (6) The Licensee may publish excerpts of less than 100 words from the licensed dataset pursuant to clause 3.  (7) The Licensor grants the Licensee this right to use the licensed dataset 'as is'. Licensor does not make, and expressly disclaims, any express or implied warranties, representations or endorsements of any kind whatsoever.  (8) I will not attempt to de-anonymise the individual contributors to the TSCC.  (9) This Agreement shall be governed by and construed in accordance with the laws of England and the English courts shall have exclusive jurisdiction.
